import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { NOT_FOR_VENUE } from "@/lib/hospitality/b2b-only";
import { APPROVAL_REFUSALS, approvalRefusal, newestApprovals, type GatePiece } from "@/lib/content/approval-gate";
import { liveLinkedInJobsByPiece, liveLinkedInNote, type LiveLinkedInStatus } from "@/lib/publishing/live-linkedin-jobs";
import { resolveBlogTarget } from "@/lib/publishing/blog-target";
import { nextForType, planWeekDeploy, type DeployManualSocial, type DeployPiece, type DeploySocial } from "@/lib/publishing/deploy-week";
import { LEFT_FOR_SCHEDULER_PARAM } from "@/lib/export/left-for-scheduler";
import { POST as queueLinkedInPost } from "@/app/api/publish/linkedin-direct/route";
import { linkedInPlatformForPostType } from "@/lib/linkedin/direct-publish";
import { resolveDefaultPage, type PageRow } from "@/lib/linkedin/default-page";
import { POST as sendBlogToWebsite } from "@/app/api/publish/website/route";
import { loadDocumentHashes } from "@/lib/content/media-approval";
import { linkedInPublishReview } from "@/lib/publishing/week-preview";

export const maxDuration = 60;

interface AlreadyQueued { pieceId: string; title: string; status: LiveLinkedInStatus; note: string }

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
 * write. Before queueing, every planned feed post is looked up in the
 * LinkedIn queue (any account, any live status): one already there is
 * reported as already in the queue, never as not queued, so a second deploy
 * or a re-run after a failure part way through posts nothing twice. The
 * queue route's deterministic job id per piece and account backs this up.
 *
 * Nothing is queued unless its newest recorded approval matches its current
 * text (src/lib/content/approval-gate.ts). Each post not queued says where
 * it goes next: the scheduler export (only for the types it carries), by
 * hand, or back for approval.
 *
 * Refused: a missing confirmation (so a link or page load never deploys),
 * another company's week, a client without the publish right, a hospitality
 * company (for everyone: this deploys a LinkedIn week), and any week with a
 * piece not yet approved.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    weekId?: unknown; confirm?: unknown; socialAccountId?: unknown; ctaCluster?: unknown; days?: unknown; preview?: unknown;
  } | null;
  // A preview changes nothing, so it needs no confirmation; every real deploy does.
  const preview = body?.preview === true;
  // Ticked days as YYYY-MM-DD. Omitted means every day; an empty list means none.
  const days = Array.isArray(body?.days) ? body.days.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : undefined;
  const weekId = typeof body?.weekId === "string" ? body.weekId : "";
  if (!weekId) return NextResponse.json({ error: "weekId is required" }, { status: 400 });
  if (!preview && body?.confirm !== true) return NextResponse.json({ error: "Confirm Deploy week to go ahead." }, { status: 400 });

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
    .select("id, title, content_type, post_type, approval_status, day_of_week, scheduled_time, scheduled_date, markdown_body, first_comment")
    .eq("week_id", weekId).eq("company_id", companyId)
    .order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (piecesError) return NextResponse.json({ error: "Could not read the week." }, { status: 500 });
  const plan = planWeekDeploy((pieceRows || []) as DeployPiece[], week.date_start as string, new Date(), { days });
  if (!plan.ready) {
    return NextResponse.json({
      error: plan.unapproved > 0
        ? `Nothing is approved yet: ${plan.unapproved} ${plan.unapproved === 1 ? "piece is" : "pieces are"} waiting for approval.`
        : "This week has nothing to deploy.",
    }, { status: 409 });
  }

  // The LinkedIn profile the spokesperson's posts go to: the one the user
  // confirmed, or the company's only active one. Company page posts go to the
  // company's default page and to no other: deploying never picks a page.
  const { data: accountRows } = await supabase.from("company_social_accounts").select("id, platform, is_active, account_name, platform_metadata")
    .eq("company_id", companyId).in("platform", ["linkedin_personal", "linkedin_company"]);
  const accountIds = (accountRows || []).filter((a) => a.platform === "linkedin_personal" && a.is_active === true).map((a) => a.id as string);
  const pageRows = (accountRows || []).filter((a) => a.platform === "linkedin_company") as unknown as PageRow[];
  const activePages = pageRows.filter((a) => a.is_active === true);
  const pageId = resolveDefaultPage(pageRows)?.id ?? null;
  const pieceFeedPlatform = (pieceId: string) =>
    linkedInPlatformForPostType((pieceRows || []).find((p) => p.id === pieceId)?.post_type as string | null | undefined);
  const requested = typeof body.socialAccountId === "string" ? body.socialAccountId : null;
  if (requested && !accountIds.includes(requested)) {
    return NextResponse.json({ error: "Choose a LinkedIn account connected to this company." }, { status: 404 });
  }
  if (!requested && accountIds.length > 1 && plan.social.some((s) => pieceFeedPlatform(s.pieceId) === "linkedin_personal")) {
    return NextResponse.json({ error: "Choose which LinkedIn account the week goes to.", code: "choose_account" }, { status: 409 });
  }
  const accountId = requested || (accountIds.length === 1 ? accountIds[0] : null);

  const queued: DeploySocial[] = [];
  const alreadyQueued: AlreadyQueued[] = [];
  const notQueued: DeployManualSocial[] = [];

  // Every planned feed post, queueable or not, is checked against the
  // LinkedIn queue first: one with a live job (any account) is reported as
  // already there, never as not queued, so nobody schedules it again.
  const planned = [...plan.social, ...plan.manualSocial];
  const plannedIds = planned.map((s) => s.pieceId);
  const [live, approvals, documentHashes] = await Promise.all([
    liveLinkedInJobsByPiece(supabase, companyId, plannedIds),
    newestApprovals(supabase, companyId, plannedIds),
    loadDocumentHashes(supabase, companyId, plannedIds),
  ]);
  if (!live) return NextResponse.json({ error: "Could not read the LinkedIn queue, so nothing was deployed." }, { status: 500 });
  const pieceById = new Map(((pieceRows || []) as GatePiece[]).map((p) => [p.id, p]));
  // Only text someone approved is queued or handed to the export: the
  // newest recorded approval must match the piece as it is now.
  const approvalRefusalFor = (pieceId: string) => {
    const piece = pieceById.get(pieceId);
    if (!piece || !approvals || !documentHashes) return APPROVAL_REFUSALS.unreadable;
    return approvalRefusal(piece, approvals.get(pieceId), documentHashes.get(pieceId) ?? null);
  };

  for (const m of plan.manualSocial) {
    const status = live.get(m.pieceId);
    if (status) { alreadyQueued.push({ pieceId: m.pieceId, title: m.title, status, note: liveLinkedInNote(status) }); continue; }
    const refused = approvalRefusalFor(m.pieceId);
    notQueued.push(refused ? { ...m, reason: refused, next: "approve" } : m);
  }

  const toQueue: DeploySocial[] = [];
  for (const s of plan.social) {
    const status = live.get(s.pieceId);
    if (status) { alreadyQueued.push({ pieceId: s.pieceId, title: s.title, status, note: liveLinkedInNote(status) }); continue; }
    const refused = approvalRefusalFor(s.pieceId);
    if (refused) { notQueued.push({ pieceId: s.pieceId, title: s.title, contentType: s.contentType, reason: refused, next: "approve" }); continue; }
    toQueue.push(s);
  }

  if (preview) {
    const review = await linkedInPublishReview(supabase, companyId, toQueue, pieceById as Map<string, GatePiece & Record<string, unknown>>, (s) => {
      const toPage = pieceFeedPlatform(s.pieceId) === "linkedin_company";
      const target = toPage ? pageId : accountId;
      return (accountRows || []).find((a) => a.id === target)?.account_name as string | null ?? null;
    });
    return NextResponse.json({
      preview: true,
      items: review,
      alreadyQueued,
      notQueued,
      refused: plan.unapprovedPieces,
      unselected: plan.unselected,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  for (const s of toQueue) {
    const toPage = pieceFeedPlatform(s.pieceId) === "linkedin_company";
    const target = toPage ? pageId : accountId;
    if (!target) {
      const reason = !toPage ? "No LinkedIn account is connected."
        : activePages.length > 0 ? "No default LinkedIn page is set. Choose the default page in Settings, then deploy again."
        : "No LinkedIn company page is connected.";
      notQueued.push({ pieceId: s.pieceId, title: s.title, contentType: s.contentType, reason, next: nextForType(s.contentType) });
      continue;
    }
    // The existing queue route keeps its own checks (approval record,
    // publish right, account ownership, feed, media rules) and its unique job id.
    const res = await queueLinkedInPost(new Request(new URL("/api/publish/linkedin-direct", request.url), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId, pieceId: s.pieceId, socialAccountId: target, scheduledFor: s.scheduledFor }),
    }));
    if (res.status === 201) { queued.push(s); continue; }
    const err = await res.json().catch(() => ({})) as { error?: string; code?: string };
    notQueued.push({
      pieceId: s.pieceId, title: s.title, contentType: s.contentType,
      reason: err.error || "It could not be queued.",
      next: err.code === "approval_mismatch" ? "approve" : nextForType(s.contentType),
    });
  }

  // The blog: a pull request on the AGENCY website, through the existing
  // admin-only route. Merging it stays manual.
  const isPlatformCompany = company.slug === (process.env.PLATFORM_COMPANY_SLUG || "agency-bristol");
  const blogs: Array<{ id: string; title: string; status: "pull_request_opened" | "already_sent" | "manual"; url?: string | null; reason?: string }> = [];
  if (plan.blogs.length) {
    // The service list is the company's own publish target, not a constant.
    const resolved = isPlatformCompany ? await resolveBlogTarget(supabase, companyId) : null;
    const clusters = resolved && "target" in resolved ? resolved.target.ctaClusters : [];
    const ctaCluster = typeof body.ctaCluster === "string" && clusters.some((c) => c.code === body.ctaCluster) ? body.ctaCluster : null;
    const needsService = clusters.length > 0;
    const { data: sent } = await supabase.from("publishing_jobs").select("content_piece_id, external_url, status")
      .eq("company_id", companyId).eq("target_platform", "website").in("content_piece_id", plan.blogs.map((b) => b.id));
    for (const blog of plan.blogs) {
      const prior = (sent || []).find((j) => j.content_piece_id === blog.id && ["queued", "running", "published"].includes(j.status as string));
      if (prior) { blogs.push({ ...blog, status: "already_sent", url: prior.external_url as string | null }); continue; }
      if (!isPlatformCompany) { blogs.push({ ...blog, status: "manual", reason: "Publish this blog on the company's own website." }); continue; }
      if (user.role !== "admin") { blogs.push({ ...blog, status: "manual", reason: "AGENCY sends the blog to the website as a pull request." }); continue; }
      if (resolved && "refusal" in resolved) { blogs.push({ ...blog, status: "manual", reason: resolved.refusal }); continue; }
      if (needsService && !ctaCluster) { blogs.push({ ...blog, status: "manual", reason: "Choose which service the blog points readers to, then deploy again." }); continue; }
      const res = await sendBlogToWebsite(new Request(new URL("/api/publish/website", request.url), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ pieceId: blog.id, ctaCluster: ctaCluster || "" }),
      }));
      const out = await res.json().catch(() => ({})) as { pullRequest?: string; url?: string; error?: string };
      if (res.ok) blogs.push({ ...blog, status: "pull_request_opened", url: out.pullRequest || null });
      else if (res.status === 409) blogs.push({ ...blog, status: "already_sent", url: out.url || null, reason: out.error });
      else blogs.push({ ...blog, status: "manual", reason: out.error || "The pull request could not be opened." });
    }
  }

  return NextResponse.json({
    queued,
    refused: plan.unapprovedPieces,
    unselected: plan.unselected,
    alreadyQueued,
    notQueued,
    blogs,
    newsletters: plan.newsletters.map((n) => ({ ...n, copyHref: `/content/${n.id}` })),
    // Leaves out of LinkedIn every post already in the direct queue, and
    // every post whose approval does not match its text.
    schedulerExportHref: `/api/export/metricool?weekId=${encodeURIComponent(weekId)}&${LEFT_FOR_SCHEDULER_PARAM}=true`,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
