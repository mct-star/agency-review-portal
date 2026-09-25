import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  WEBSITE_BLOG_BASE, buildBlogMdx, imageExt, publishProblems, readTimeFor, slugify,
} from "@/lib/publishing/website-blog";

export const maxDuration = 60;

/**
 * POST /api/publish/website  { pieceId, ctaCluster, dryRun? }
 *
 * Sends an approved blog to agencymedicalmarketing.com as a pull request
 * on the agency-website repo (25 Sept 2026): the MDX post, its hero and
 * its share card, on a branch of their own. Nothing goes live until the
 * pull request is merged, and the site's own tests check the post first
 * (hero present and not a social card, ctaCluster mapped to a service).
 *
 * dryRun returns the exact files and changes nothing. A slug already on
 * the site, or already sent, is refused.
 *
 * Env: WEBSITE_GITHUB_TOKEN (fine-grained, agency-website only: contents
 * and pull requests, read and write); WEBSITE_GITHUB_REPO optional,
 * default mct-star/agency-website.
 */
const GH = "https://api.github.com";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pieceId = typeof body.pieceId === "string" ? body.pieceId : "";
  const ctaCluster = typeof body.ctaCluster === "string" ? body.ctaCluster : "";
  const dryRun = body.dryRun === true;
  if (!pieceId) return NextResponse.json({ error: "pieceId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase.from("content_pieces").select("*").eq("id", pieceId).maybeSingle();
  if (!piece) return NextResponse.json({ error: "Content piece not found" }, { status: 404 });

  const [{ data: assets }, { data: images }, { data: company }, { data: sent }] = await Promise.all([
    supabase.from("content_assets").select("asset_type, text_content").eq("content_piece_id", pieceId),
    supabase.from("content_images").select("public_url, archetype, sort_order").eq("content_piece_id", pieceId).order("sort_order"),
    supabase.from("companies").select("spokesperson_name").eq("id", piece.company_id).maybeSingle(),
    supabase.from("publishing_jobs").select("external_url, status").eq("content_piece_id", pieceId)
      .eq("target_platform", "website").in("status", ["queued", "running", "published"]).limit(1),
  ]);
  if (sent && sent.length > 0) {
    return NextResponse.json({ error: "This blog has already been sent to the website.", url: sent[0].external_url }, { status: 409 });
  }

  const asset = (t: string) => (assets || []).find(a => a.asset_type === t)?.text_content?.trim() || "";
  const title = (piece.title || "").trim();
  const slug = slugify(asset("url_slug") || title);
  const hero = (images || []).find(i => i.archetype === "hero_image_prompt")?.public_url || null;
  const og = (images || []).find(i => i.archetype === "cover_image_prompt")?.public_url || null;

  const problems = publishProblems({
    approved: piece.approval_status === "approved", contentType: piece.content_type,
    title, body: piece.markdown_body || "", slug, ctaCluster, heroUrl: hero,
  });
  if (problems.length > 0) return NextResponse.json({ error: problems.join(" "), problems }, { status: 422 });

  const heroPath = `public/images/blog/${slug}.${imageExt(hero!)}`;
  const ogPath = og ? `public/images/blog/${slug}-og.${imageExt(og)}` : null;
  const mdxPath = `src/content/blog/${slug}.mdx`;
  const words = (piece.markdown_body || "").split(/\s+/).filter(Boolean).length;
  const mdx = buildBlogMdx({
    slug, title,
    seoTitle: asset("seo_title") || title,
    description: asset("seo_meta_description") || asset("excerpt") || title,
    date: new Date().toISOString().slice(0, 10),
    readTime: readTimeFor(words),
    author: company?.spokesperson_name || "Michael Colling-Tuck",
    heroImage: "/" + heroPath.replace(/^public\//, ""),
    ogImage: ogPath ? "/" + ogPath.replace(/^public\//, "") : null,
    ctaCluster,
  }, piece.markdown_body || "");

  const files = [
    { path: mdxPath, from: "the approved text" },
    { path: heroPath, from: hero! },
    ...(ogPath ? [{ path: ogPath, from: og! }] : []),
  ];
  const liveUrl = `${WEBSITE_BLOG_BASE}/${slug}`;
  const branch = `blog/${slug}`;

  const token = process.env.WEBSITE_GITHUB_TOKEN;
  const repo = process.env.WEBSITE_GITHUB_REPO || "mct-star/agency-website";
  if (dryRun) {
    return NextResponse.json({ dryRun: true, branch, repo, files, mdx, liveUrl, ready: !!token,
      ...(token ? {} : { missing: "WEBSITE_GITHUB_TOKEN is not set in the portal's Vercel project, so nothing can be sent yet." }) });
  }
  if (!token) {
    return NextResponse.json({ error: "WEBSITE_GITHUB_TOKEN is not set in the portal's Vercel project, so nothing was sent." }, { status: 503 });
  }

  const gh = (path: string, init: RequestInit = {}) => fetch(`${GH}/repos/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
  });

  try {
    if ((await gh(`/contents/${mdxPath}?ref=main`)).status === 200) {
      return NextResponse.json({ error: `A post called ${slug} is already on the website. Change the URL slug and try again.` }, { status: 409 });
    }
    const main = await gh("/git/ref/heads/main");
    if (!main.ok) throw new Error(`reading main: GitHub ${main.status}`);
    const baseSha = (await main.json()).object.sha as string;
    const ref = await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) });
    if (!ref.ok && ref.status !== 422) throw new Error(`creating ${branch}: GitHub ${ref.status}`);

    const put = async (path: string, base64: string) => {
      const r = await gh(`/contents/${path}`, { method: "PUT", body: JSON.stringify({ message: `Blog: ${title}`, content: base64, branch }) });
      if (!r.ok) throw new Error(`writing ${path}: GitHub ${r.status} ${(await r.text()).slice(0, 160)}`);
    };
    for (const [path, url] of [[heroPath, hero!], ...(ogPath ? [[ogPath, og!]] : [])] as Array<[string, string]>) {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`downloading ${url}: ${img.status}`);
      await put(path, Buffer.from(await img.arrayBuffer()).toString("base64"));
    }
    await put(mdxPath, Buffer.from(mdx, "utf8").toString("base64"));

    const pr = await gh("/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: `Blog: ${title}`, head: branch, base: "main",
        body: `A new blog post from the content portal, approved there.\n\n- Post: \`${mdxPath}\`\n- Hero: \`${heroPath}\`${ogPath ? `\n- Share card: \`${ogPath}\`` : ""}\n- Goes live at ${liveUrl} when merged.`,
      }),
    });
    if (!pr.ok) throw new Error(`opening the pull request: GitHub ${pr.status} ${(await pr.text()).slice(0, 160)}`);
    const prUrl = (await pr.json()).html_url as string;

    await supabase.from("publishing_jobs").insert({
      company_id: piece.company_id, content_piece_id: pieceId, target_platform: "website", status: "queued",
      external_url: prUrl, canonical_url: liveUrl, publish_payload: { branch, files: files.map(f => f.path), ctaCluster },
      triggered_by: admin.id ?? null,
    });
    await supabase.from("content_syndication_links").insert({ content_piece_id: pieceId, platform: "website", external_url: liveUrl, is_canonical: true });

    return NextResponse.json({ pullRequest: prUrl, liveUrl, branch });
  } catch (err) {
    return NextResponse.json({ error: `Nothing went live. ${err instanceof Error ? err.message : "GitHub error"}` }, { status: 502 });
  }
}
