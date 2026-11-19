import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveBlogTarget } from "@/lib/publishing/blog-target";
import { APPROVAL_REFUSALS, recordedApprovalRefusal, type GatePiece } from "@/lib/content/approval-gate";
import { resolveBlogGateSettings } from "@/lib/publishing/blog-gate-settings";
import { blogImagesForGate, type BlogImageRow } from "@/lib/publishing/blog-gate-input";
import { runBlogGate, type BlogGateReport } from "@/lib/publishing/blog-gate";
import { IMAGE_COLUMNS } from "@/lib/publishing/blog-images";
import {
  buildBlogMdx, imageExt, publishProblems, readTimeFor, slugify,
} from "@/lib/publishing/website-blog";

export const maxDuration = 60;

/**
 * POST /api/publish/website  { pieceId, ctaCluster, dryRun?, preview? }
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
 * Where it goes is the company's publish target (src/lib/publishing/
 * blog-target.ts): its active company_api_configs row, or, with no row,
 * today's publisher from the env below.
 *
 * Env: WEBSITE_GITHUB_TOKEN (fine-grained, agency-website only: contents
 * and pull requests, read and write); WEBSITE_GITHUB_REPO optional,
 * default mct-star/agency-website. Both apply only to the legacy target.
 * WEBSITE_LEGACY_TARGET_COMPANY_ID optional: when set, only that company
 * may use the legacy target and any other company with no row of its own
 * is refused (422). Unset, every company without a row falls back, as it
 * always has.
 *
 * The gate (15 Nov 2026). Before anything is sent, every problem is
 * gathered and answered at once (422, { error, problems, imageChecks }):
 * the checks above; the recorded approval (src/lib/content/approval-gate.ts:
 * the newest content_approvals row must approve the exact current text, for
 * every company); and, only when the company's blog_gate settings have
 * enforceImageChecks true, every image check (src/lib/publishing/
 * blog-gate.ts). For any other company the image checks are reported under
 * imageChecks as warnings and do not block. Settings that cannot be read
 * refuse.
 *
 * Images come from blogImagesForGate, so the checks and the files cannot
 * drift: the first hero, each inline image the body places, and as the
 * share card the newest uploaded share_card image. The older 16:9 cover
 * picture stands in for the share card only while the company is not
 * enforcing image checks. Inline images carry their record's alt text into
 * the post.
 *
 * A plain dry run ({ dryRun: true }) is the preview as it was: it leaves
 * out the recorded-approval check and the imageChecks key. Add
 * withChecks: true for the full verdict, as the page does. A real send
 * always runs every check.
 *
 * Website preview (19 Nov 2026). { preview: true } opens the same pull
 * request before the blog is approved, as a GitHub draft, so Vercel builds
 * the post exactly as the site will show it and posts the preview link on
 * the pull request. It needs no approval and the image checks only warn;
 * every other check (slug, service, dashes, colon, hero) still refuses,
 * because the site's build would. A repository without draft pull requests
 * gets an ordinary one titled as a preview not to merge. The pull request
 * link is kept in content_syndication_links with platform "website_preview"
 * (not publishing_jobs: that table is read across the portal as "sent"),
 * and nothing is recorded as sent. Previewing again updates the same
 * branch and pull request.
 *
 * Both a preview and a send look for an open pull request from the blog's
 * branch first. The approved send writes the files to that branch, renames
 * the pull request, marks a draft ready for review, and records the send;
 * it opens a new pull request only when there is none.
 */
function approvalSentence(title: string, refusal: string): string {
  const name = title ? `The blog "${title}"` : "This blog";
  const reason = refusal.replace("so it was not queued", "so nothing was sent");
  if (reason.startsWith("Its ")) return `${name}'s ${reason.slice(4)}`;
  if (reason.startsWith("It ")) return `${name} ${reason.slice(3)}`;
  return `${name}: ${reason}`;
}

const GH = "https://api.github.com";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pieceId = typeof body.pieceId === "string" ? body.pieceId : "";
  const ctaCluster = typeof body.ctaCluster === "string" ? body.ctaCluster : "";
  const dryRun = body.dryRun === true;
  const preview = body.preview === true;
  // Every check runs on a real send; a dry run runs them when asked. A
  // preview never checks the approval.
  const withChecks = (!dryRun || body.withChecks === true) && !preview;
  const reportChecks = withChecks || preview;
  if (!pieceId) return NextResponse.json({ error: "pieceId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase.from("content_pieces").select("*").eq("id", pieceId).maybeSingle();
  if (!piece) return NextResponse.json({ error: "Content piece not found" }, { status: 404 });

  const [{ data: assets }, { data: images }, { data: company }, { data: sent }] = await Promise.all([
    supabase.from("content_assets").select("asset_type, text_content").eq("content_piece_id", pieceId),
    supabase.from("content_images").select(IMAGE_COLUMNS).eq("content_piece_id", pieceId).order("sort_order"),
    supabase.from("companies").select("spokesperson_name").eq("id", piece.company_id).maybeSingle(),
    supabase.from("publishing_jobs").select("external_url, status").eq("content_piece_id", pieceId)
      .eq("target_platform", "website").in("status", ["queued", "running", "published"]).limit(1),
  ]);
  if (sent && sent.length > 0) {
    return NextResponse.json({ error: "This blog has already been sent to the website.", url: sent[0].external_url }, { status: 409 });
  }

  const resolved = await resolveBlogTarget(supabase, piece.company_id as string);
  if ("refusal" in resolved) return NextResponse.json({ error: resolved.refusal }, { status: 422 });
  const { target, token } = resolved;
  const author = company?.spokesperson_name || target.defaultAuthor;
  if (!author) {
    return NextResponse.json({ error: "Set a spokesperson or a default author for this company before sending the blog." }, { status: 422 });
  }

  const gateSettings = await resolveBlogGateSettings(supabase, piece.company_id as string);
  if ("refusal" in gateSettings) {
    return NextResponse.json({ error: gateSettings.refusal, problems: [gateSettings.refusal] }, { status: 422 });
  }
  const enforced = gateSettings.settings.enforceImageChecks;

  const asset = (t: string) => (assets || []).find(a => a.asset_type === t)?.text_content?.trim() || "";
  const title = (piece.title || "").trim();
  const bodyText = piece.markdown_body || "";
  const slug = slugify(asset("url_slug") || title);

  // The images exactly as they publish, shared with the gate.
  const gate = blogImagesForGate((images || []) as BlogImageRow[], bodyText);
  const heroImage = gate.images.find(i => i.role === "hero");
  const shareImage = gate.images.find(i => i.role === "share");
  const hero = heroImage?.publicUrl || null;
  const og = shareImage?.publicUrl || (enforced ? null : gate.legacyCover?.publicUrl || null);
  // The repository path of an image, or null when there is no file.
  const published = (url: string | null, suffix: string) => url ? `${target.imagePath}/${slug}${suffix}.${imageExt(url)}` : null;
  const heroPath = published(hero, "");
  const ogPath = published(og, "-og");
  // In-article images, one per [[image: n]] slot the writer left.
  const inArticle = gate.images
    .filter(i => i.role === "inline" && i.n !== undefined && !!i.publicUrl)
    .map(i => ({
      n: i.n!, url: i.publicUrl!, alt: (i.record?.alt || "").trim(), caption: (i.record?.caption || "").trim(),
      path: published(i.publicUrl, `-${i.n}`)!,
    }));

  const problems = publishProblems({
    approved: preview || piece.approval_status === "approved", contentType: piece.content_type,
    title, body: bodyText, slug, ctaCluster, heroUrl: hero,
  }, target.ctaClusters);

  if (withChecks) {
    const refusal = await recordedApprovalRefusal(supabase, piece.company_id as string, piece as GatePiece);
    // "Not approved" is already said by the checks above.
    if (refusal && refusal !== APPROVAL_REFUSALS.notApproved) problems.push(approvalSentence(title, refusal));
  }

  // The gate sees the stored files, exactly as the image panel does
  // (loadBlogImagesPayload), so "the share image is the same file as the
  // hero" compares the uploads, not the names they publish under (those
  // always differ).
  const report: BlogGateReport = runBlogGate({
    pieceTitle: title,
    body: bodyText,
    images: gate.images,
    settings: {
      photographTreatment: gateSettings.settings.photographTreatment,
      inlineImageWordLimit: gateSettings.settings.inlineImageWordLimit,
      requireShareCard: gateSettings.settings.requireShareCard,
    },
  });
  if (enforced && !preview) {
    problems.push(...report.problems);
    if (shareImage && !shareImage.publicUrl) {
      problems.push(`The share image for the blog "${title}" has no stored file. Upload it again.`);
    }
  }
  const imageChecks = reportChecks ? { imageChecks: { enforced: enforced && !preview, report } } : {};
  if (problems.length > 0) return NextResponse.json({ error: problems.join(" "), problems, ...imageChecks }, { status: 422 });

  const imageMap = Object.fromEntries(inArticle.map(i => [String(i.n), { src: "/" + i.path.replace(/^public\//, ""), alt: i.alt, caption: i.caption }]));
  const mdxPath = `${target.contentPath}/${slug}.mdx`;
  const words = bodyText.split(/\s+/).filter(Boolean).length;
  const mdx = buildBlogMdx({
    slug, title,
    seoTitle: asset("seo_title") || title,
    description: asset("seo_meta_description") || asset("excerpt") || title,
    date: new Date().toISOString().slice(0, 10),
    readTime: readTimeFor(words),
    author,
    heroImage: "/" + heroPath!.replace(/^public\//, ""),
    ogImage: ogPath ? "/" + ogPath.replace(/^public\//, "") : null,
    ctaCluster,
  }, bodyText, imageMap);

  const files = [
    { path: mdxPath, from: "the approved text" },
    { path: heroPath!, from: hero! },
    ...(ogPath ? [{ path: ogPath, from: og! }] : []),
    ...inArticle.map(i => ({ path: i.path, from: i.url })),
  ];
  const liveUrl = `${target.liveBaseUrl}/${slug}`;
  const branch = `blog/${slug}`;

  const repo = target.repo;
  const noToken = target.source === "legacy_default"
    ? "WEBSITE_GITHUB_TOKEN is not set in the portal's Vercel project"
    : "This company's website publishing token is not set";
  if (dryRun) {
    return NextResponse.json({ dryRun: true, ...(preview ? { preview: true } : {}), branch, repo, files, mdx, liveUrl, ready: !!token,
      ...(token ? {} : { missing: `${noToken}, so nothing can be sent yet.` }), ...imageChecks });
  }
  if (!token) {
    return NextResponse.json({ error: `${noToken}, so nothing was sent.` }, { status: 503 });
  }

  const gh = (path: string, init: RequestInit = {}) => fetch(`${GH}/repos/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
  });

  const prTitle = preview ? `Preview, not approved, do not merge: Blog: ${title}` : `Blog: ${title}`;
  const prBody = preview
    ? `A preview of a blog post from the content portal. It is not approved yet, so do not merge it. Vercel posts the preview link below; the portal marks this ready for review when the blog is approved and sent.\n\n- Post: \`${mdxPath}\`\n- Goes live at ${liveUrl} once approved and merged.`
    : `A new blog post from the content portal, approved there.\n\n- Post: \`${mdxPath}\`\n- Hero: \`${heroPath}\`${ogPath ? `\n- Share card: \`${ogPath}\`` : ""}${inArticle.length ? `\n- In-article images: ${inArticle.length}` : ""}\n- Goes live at ${liveUrl} when merged.`;

  try {
    if ((await gh(`/contents/${mdxPath}?ref=${target.baseBranch}`)).status === 200) {
      return NextResponse.json({ error: `A post called ${slug} is already on the website. Change the URL slug and try again.` }, { status: 409 });
    }
    // An open pull request from this blog's branch: a preview, or an earlier send.
    const owner = repo.split("/")[0];
    const open = await gh(`/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);
    const openList = open.ok ? await open.json().catch(() => []) : [];
    const existing = Array.isArray(openList) && openList[0]
      ? openList[0] as { html_url: string; number: number; node_id?: string; draft?: boolean }
      : null;

    const main = await gh(`/git/ref/heads/${target.baseBranch}`);
    if (!main.ok) throw new Error(`reading ${target.baseBranch}: GitHub ${main.status}`);
    const baseSha = (await main.json()).object.sha as string;
    const ref = await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) });
    if (!ref.ok && ref.status !== 422) throw new Error(`creating ${branch}: GitHub ${ref.status}`);
    // 422: the branch is already there (a preview), so each file it holds is replaced by its sha.
    const branchExisted = ref.status === 422;

    const put = async (path: string, base64: string) => {
      let sha: string | undefined;
      if (branchExisted) {
        const current = await gh(`/contents/${path}?ref=${encodeURIComponent(branch)}`);
        if (current.status === 200) sha = ((await current.json().catch(() => ({}))) as { sha?: string }).sha;
      }
      const r = await gh(`/contents/${path}`, { method: "PUT", body: JSON.stringify({ message: `Blog: ${title}`, content: base64, branch, ...(sha ? { sha } : {}) }) });
      if (!r.ok) throw new Error(`writing ${path}: GitHub ${r.status} ${(await r.text()).slice(0, 160)}`);
    };
    const uploads: Array<[string, string]> = [[heroPath!, hero!], ...(ogPath ? [[ogPath, og!]] as Array<[string, string]> : []), ...inArticle.map(i => [i.path, i.url] as [string, string])];
    for (const [path, url] of uploads) {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`downloading ${url}: ${img.status}`);
      await put(path, Buffer.from(await img.arrayBuffer()).toString("base64"));
    }
    await put(mdxPath, Buffer.from(mdx, "utf8").toString("base64"));

    let prUrl: string;
    let draft: boolean;
    if (existing) {
      prUrl = existing.html_url;
      draft = !!existing.draft;
      if (!preview) {
        const renamed = await gh(`/pulls/${existing.number}`, { method: "PATCH", body: JSON.stringify({ title: prTitle, body: prBody }) });
        if (!renamed.ok) throw new Error(`renaming the pull request: GitHub ${renamed.status}`);
        if (draft) {
          const ready = await fetch(`${GH}/graphql`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query: "mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }",
              variables: { id: existing.node_id },
            }),
          });
          const answer = ready.ok ? await ready.json().catch(() => null) : null;
          if (!answer || answer.errors) throw new Error(`marking the pull request ready for review: GitHub ${ready.status}`);
          draft = false;
        }
      }
    } else {
      const openPr = (asDraft: boolean, prName: string) => gh("/pulls", {
        method: "POST",
        body: JSON.stringify({ title: prName, head: branch, base: target.baseBranch, body: prBody, ...(asDraft ? { draft: true } : {}) }),
      });
      let pr = await openPr(preview, prTitle);
      draft = preview;
      if (preview && pr.status === 422 && /draft/i.test(await pr.clone().text())) {
        pr = await openPr(false, prTitle);
        draft = false;
      }
      if (!pr.ok) throw new Error(`opening the pull request: GitHub ${pr.status} ${(await pr.text()).slice(0, 160)}`);
      prUrl = (await pr.json()).html_url as string;
    }

    if (preview) {
      const { data: links } = await supabase.from("content_syndication_links").select("external_url")
        .eq("content_piece_id", pieceId).eq("platform", "website_preview");
      if (!(links || []).some((l: { external_url: string }) => l.external_url === prUrl)) {
        await supabase.from("content_syndication_links").insert({ content_piece_id: pieceId, platform: "website_preview", external_url: prUrl, is_canonical: false });
      }
      return NextResponse.json({ preview: true, pullRequest: prUrl, draft, liveUrl, branch, ...imageChecks });
    }

    await supabase.from("publishing_jobs").insert({
      company_id: piece.company_id, content_piece_id: pieceId, target_platform: "website", status: "queued",
      external_url: prUrl, canonical_url: liveUrl, publish_payload: { branch, files: files.map(f => f.path), ctaCluster },
      triggered_by: admin.id ?? null,
    });
    await supabase.from("content_syndication_links").insert({ content_piece_id: pieceId, platform: "website", external_url: liveUrl, is_canonical: true });

    return NextResponse.json({ pullRequest: prUrl, liveUrl, branch, ...imageChecks });
  } catch (err) {
    return NextResponse.json({ error: `Nothing went live. ${err instanceof Error ? err.message : "GitHub error"}` }, { status: 502 });
  }
}
