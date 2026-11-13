import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { NOT_FOR_VENUE } from "@/lib/hospitality/b2b-only";
import { directLinkedInJobId } from "@/lib/linkedin/direct-publish";
import { CTA_CLUSTERS } from "@/lib/publishing/website-blog";
import { planWeekDeploy, type DeployManualSocial, type DeployPiece, type DeploySocial } from "@/lib/publishing/deploy-week";
import { POST as queueLinkedInPost } from "@/app/api/publish/linkedin-direct/route";
import { POST as sendBlogToWebsite } from "@/app/api/publish/website/route";

export const maxDuration = 60;

/**
 * POST /api/publish/deploy-week  { weekId, confirm: true, socialAccountId?, ctaCluster? }
 *
 * Deploy week (13 Nov 2026): one confirmed action for a fully approved
 * week. It is not a second publishing path. Each approved feed post is
 * handed to the existing direct LinkedIn queue route at its scheduled UK
 * time, and the blog to the existing website route, which opens a pull
 * request. Those routes keep their own checks (approval, the publish right,
 * company ownership, media rules).
 *
 * Deploying is recorded only as the publishing_jobs rows those routes
 * write: the LinkedIn rows have a deterministic id per piece and account,
 * so a second deploy finds them and queues nothing twice.
 *
 * Refused: a missing confirmation (so a link or page load never deploys),
 * another company's week, a client without the publish right, a hospitality
 * company (for everyone: this deploys a LinkedIn week), and any week with a
 * piece not yet approved.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    weekId?: unknown; confirm?: unknown; socialAccountId?: unknown; ctaCluster?: unknown;
  } | null;
  const weekId = typeof body?.weekId === "string" ? body.weekId : "";
  if (!weekId) return NextResponse.json({ error: "weekId is required" }, { status: 400 });
  if (body?.confirm !== true) return NextResponse.json({ error: "Confirm Deploy week to go ahead." }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: week } = await supabase.from("weeks").select("id, company_id, week_number, date_start")
    .eq("id", weekId).maybeSingle();
  const user = week ? await requireCompanyUser(week.company_id as string) : null;
  if (!week || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = week.company_id as string;

  const refused = await refuseHospitality(user, companyId);
  if (refused) return refused;
  if (user.role !== "admin" && !user.can_publish) {
    return NextResponse.json({ error: "Your account cannot publish. Ask AGENCY to switch publishing on." }, { status: 403 });
  }
  const { data: company } = await supabase.from("companies").select("id, slug, post_pack").eq("id", companyId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (company.post_pack === "hospitality") {
    return NextResponse.json({ error: NOT_FOR_VENUE.apiMessage, code: "not_in_your_pack" }, { status: 403 });
  }

  const { data: pieceRows, error: piecesError } = await supabase.from("content_pieces")
    .select("id, title, content_type, approval_status, day_of_week, scheduled_time, scheduled_date")
    .eq("week_id", weekId).eq("company_id", companyId);
  if (piecesError) return NextResponse.json({ error: "Could not read the week." }, { status: 500 });
  const plan = planWeekDeploy((pieceRows || []) as DeployPiece[], week.date_start as string);
  if (!plan.ready) {
    return NextResponse.json({
      error: plan.unapproved > 0
        ? `Approve every piece first: ${plan.unapproved} ${plan.unapproved === 1 ? "is" : "are"} not approved yet.`
        : "This week has nothing to deploy.",
    }, { status: 409 });
  }

  // The LinkedIn account the posts go to: the one the user confirmed, or the
  // company's only active one.
  const { data: accountRows } = await supabase.from("company_social_accounts").select("id")
    .eq("company_id", companyId).eq("platform", "linkedin_personal").eq("is_active", true);
  const accountIds = (accountRows || []).map((a) => a.id as string);
  const requested = typeof body.socialAccountId === "string" ? body.socialAccountId : null;
  if (requested && !accountIds.includes(requested)) {
    return NextResponse.json({ error: "Choose a LinkedIn account connected to this company." }, { status: 404 });
  }
  if (!requested && accountIds.length > 1 && plan.social.length > 0) {
    return NextResponse.json({ error: "Choose which LinkedIn account the week goes to.", code: "choose_account" }, { status: 409 });
  }
  const accountId = requested || (accountIds.length === 1 ? accountIds[0] : null);

  const queued: DeploySocial[] = [];
  const alreadyQueued: DeploySocial[] = [];
  const notQueued: DeployManualSocial[] = [...plan.manualSocial];

  if (!accountId) {
    for (const s of plan.social) notQueued.push({ pieceId: s.pieceId, title: s.title, reason: "No LinkedIn account is connected." });
  } else if (plan.social.length) {
    const ids = new Map(plan.social.map((s) => [directLinkedInJobId(companyId, s.pieceId, accountId), s]));
    const { data: existing } = await supabase.from("publishing_jobs").select("id")
      .eq("company_id", companyId).in("id", [...ids.keys()]);
    const existingIds = new Set((existing || []).map((j) => j.id as string));
    for (const [jobId, s] of ids) {
      if (existingIds.has(jobId)) { alreadyQueued.push(s); continue; }
      const res = await queueLinkedInPost(new Request(new URL("/api/publish/linkedin-direct", request.url), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, pieceId: s.pieceId, socialAccountId: accountId, scheduledFor: s.scheduledFor }),
      }));
      if (res.status === 201) queued.push(s);
      else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        notQueued.push({ pieceId: s.pieceId, title: s.title, reason: err.error || "It could not be queued." });
      }
    }
  }

  // The blog: a pull request on the AGENCY website, through the existing
  // admin-only route. Merging it stays manual.
  const ctaCluster = typeof body.ctaCluster === "string" && CTA_CLUSTERS.some((c) => c.code === body.ctaCluster) ? body.ctaCluster : null;
  const isPlatformCompany = company.slug === (process.env.PLATFORM_COMPANY_SLUG || "agency-bristol");
  const blogs: Array<{ id: string; title: string; status: "pull_request_opened" | "already_sent" | "manual"; url?: string | null; reason?: string }> = [];
  if (plan.blogs.length) {
    const { data: sent } = await supabase.from("publishing_jobs").select("content_piece_id, external_url, status")
      .eq("company_id", companyId).eq("target_platform", "website").in("content_piece_id", plan.blogs.map((b) => b.id));
    for (const blog of plan.blogs) {
      const prior = (sent || []).find((j) => j.content_piece_id === blog.id && ["queued", "running", "published"].includes(j.status as string));
      if (prior) { blogs.push({ ...blog, status: "already_sent", url: prior.external_url as string | null }); continue; }
      if (!isPlatformCompany) { blogs.push({ ...blog, status: "manual", reason: "Publish this blog on the company's own website." }); continue; }
      if (user.role !== "admin") { blogs.push({ ...blog, status: "manual", reason: "AGENCY sends the blog to the website as a pull request." }); continue; }
      if (!ctaCluster) { blogs.push({ ...blog, status: "manual", reason: "Choose which service the blog points readers to, then deploy again." }); continue; }
      const res = await sendBlogToWebsite(new Request(new URL("/api/publish/website", request.url), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ pieceId: blog.id, ctaCluster }),
      }));
      const out = await res.json().catch(() => ({})) as { pullRequest?: string; url?: string; error?: string };
      if (res.ok) blogs.push({ ...blog, status: "pull_request_opened", url: out.pullRequest || null });
      else if (res.status === 409) blogs.push({ ...blog, status: "already_sent", url: out.url || null, reason: out.error });
      else blogs.push({ ...blog, status: "manual", reason: out.error || "The pull request could not be opened." });
    }
  }

  return NextResponse.json({
    queued,
    alreadyQueued,
    notQueued,
    blogs,
    newsletters: plan.newsletters.map((n) => ({ ...n, copyHref: `/content/${n.id}` })),
    schedulerExportHref: `/api/export/metricool?weekId=${encodeURIComponent(weekId)}`,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
