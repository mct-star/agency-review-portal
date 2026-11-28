import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseChannelManager } from "@/lib/auth/channel-manager";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { escapeLittleText, toLinkedInText } from "@/lib/linkedin/post-text";
import { oauthStateSecret } from "@/lib/linkedin/oauth-state";
import { linkedInApp } from "@/lib/linkedin/app";
import { defaultCarouselTitle } from "@/lib/linkedin/publish-preview";
import { LINKEDIN_PLATFORMS, directLinkedInJobId, linkedInDirectMedia, linkedInFeedMismatch } from "@/lib/linkedin/direct-publish";
import { recordedApprovalRefusal } from "@/lib/content/approval-gate";
import { confirmNonDefaultMessage, isFlaggedDefault, resolveDefaultPage, withDefaultFlag, type PageRow } from "@/lib/linkedin/default-page";

/** Queue an approved LinkedIn post for one explicitly selected account: a personal profile, or a company page for company page pieces. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    companyId?: string;
    pieceId?: string;
    socialAccountId?: string;
    scheduledFor?: string | null;
    /** The id of the non-default page the person confirmed posting to. */
    confirmNonDefaultPage?: unknown;
  } | null;
  if (!body?.companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const profile = await requireCompanyUser(body.companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const refused = await refuseHospitality(profile, body.companyId);
  if (refused) return refused;
  if (profile.role !== "admin" && !profile.can_publish) {
    return NextResponse.json({ error: "Your account cannot publish. Ask AGENCY to switch publishing on." }, { status: 403 });
  }
  if (!body.pieceId || !body.socialAccountId) {
    return NextResponse.json({ error: "pieceId and socialAccountId are required" }, { status: 400 });
  }

  const scheduledFor = body.scheduledFor || null;
  if (scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) <= Date.now())) {
    return NextResponse.json({ error: "Choose a future date and time" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const [{ data: piece }, { data: account }] = await Promise.all([
    supabase.from("content_pieces").select("id, company_id, approval_status, content_type, post_type, markdown_body, first_comment, title, cover_image_url")
      .eq("id", body.pieceId).eq("company_id", body.companyId).maybeSingle(),
    supabase.from("company_social_accounts").select("id, company_id, platform, account_id, account_name, access_token_encrypted, token_expires_at")
      .eq("id", body.socialAccountId).eq("company_id", body.companyId).in("platform", [...LINKEDIN_PLATFORMS]).eq("is_active", true).maybeSingle(),
  ]);

  if (!piece) return NextResponse.json({ error: "Approved content not found for this company" }, { status: 404 });
  if (piece.approval_status !== "approved") return NextResponse.json({ error: "Approve the post before publishing it." }, { status: 400 });
  // Only the text someone approved is queued: the newest recorded approval
  // must match the piece as it is now (Deploy week calls this route too).
  const approvalRefused = await recordedApprovalRefusal(supabase, body.companyId, piece);
  if (approvalRefused) return NextResponse.json({ error: approvalRefused, code: "approval_mismatch" }, { status: 409 });
  if (!account) return NextResponse.json({ error: "Choose an active LinkedIn account connected to this company." }, { status: 404 });
  const mismatch = linkedInFeedMismatch(piece.post_type, account.platform);
  if (mismatch) return NextResponse.json({ error: mismatch, code: "wrong_feed" }, { status: 409 });
  // Only the default page is posted to without asking. Any other page needs
  // the person to confirm that exact page, so a page can never be reached by accident.
  if (account.platform === "linkedin_company") {
    const { data: pages, error: pagesError } = await supabase.from("company_social_accounts")
      .select("id, account_name, is_active, platform_metadata").eq("company_id", body.companyId).eq("platform", "linkedin_company");
    if (pagesError) return NextResponse.json({ error: "Could not check the company's LinkedIn pages, so nothing was queued." }, { status: 500 });
    const def = resolveDefaultPage((pages || []) as PageRow[]);
    if (def?.id !== account.id && body.confirmNonDefaultPage !== account.id) {
      const pageName = account.account_name || "this page";
      return NextResponse.json({
        error: confirmNonDefaultMessage(pageName, def?.account_name || null),
        code: "non_default_page", pageName, defaultPageName: def?.account_name || null,
      }, { status: 409 });
    }
  }
  const expiry = account.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
  if (!account.account_id || !account.access_token_encrypted || !Number.isFinite(expiry) || expiry <= Date.now()) {
    return NextResponse.json({ error: "This LinkedIn connection needs reconnecting before it can publish." }, { status: 409 });
  }

  const [{ data: images }, { data: assets }] = await Promise.all([
    supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", piece.id),
    supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
  ]);
  const media = linkedInDirectMedia(piece.content_type, resolvePieceMedia(piece, images || [], assets || []));
  if ("error" in media) return NextResponse.json({ error: media.error }, { status: 422 });

  const postText = toLinkedInText(piece.markdown_body || "");
  const commentary = escapeLittleText(postText).trim();
  if (!commentary) return NextResponse.json({ error: "The post has no publishable text." }, { status: 400 });
  const jobId = directLinkedInJobId(body.companyId, piece.id, account.id);
  const queuedJob = {
    id: jobId,
    company_id: body.companyId,
    content_piece_id: piece.id,
    social_account_id: account.id,
    target_platform: account.platform,
    status: scheduledFor ? "scheduled" : "queued",
    scheduled_for: scheduledFor,
    triggered_by: profile.id,
    publish_payload: {
      provider: "linkedin-direct-v1",
      commentary,
      image_urls: media.imageUrls,
      video_url: media.videoUrl,
      thumbnail_url: media.thumbnailUrl,
      first_comment: piece.first_comment ? toLinkedInText(piece.first_comment) : null,
      // Several images post as one PDF document; its title is the first line as the reader sees it, as on the Mac.
      ...(media.imageUrls.length > 1 ? { document_title: defaultCarouselTitle(postText) } : {}),
    },
  };
  const { data: job, error } = await supabase.from("publishing_jobs").insert(queuedJob)
    .select("id, status, scheduled_for, social_account_id").maybeSingle();

  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("publishing_jobs").select("status, response_payload")
      .eq("id", jobId).eq("company_id", body.companyId).maybeSingle();
    const payload = existing?.response_payload as { outcome_uncertain?: boolean } | null;
    return NextResponse.json({ error: payload?.outcome_uncertain
      ? "LinkedIn may have accepted this post. Check the account before taking any further action."
      : "This post has already been queued for that account. Check its current status in the queue before taking further action." }, { status: 409 });
  }
  if (error || !job) return NextResponse.json({ error: "Could not queue this LinkedIn post." }, { status: 500 });
  return NextResponse.json({ data: job }, { status: 201 });
}

/** List safe account metadata for the signed-in company's publishing picker. */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin" && !profile.can_publish) {
    return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  }
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.from("company_social_accounts")
    .select("id, platform, account_name, account_id, token_expires_at, access_token_encrypted, is_active, platform_metadata")
    .eq("company_id", companyId).in("platform", [...LINKEDIN_PLATFORMS]);
  if (error) return NextResponse.json({ error: "Could not load LinkedIn accounts." }, { status: 500 });
  const rows = data || [];
  const defaultPage = resolveDefaultPage(rows.filter((row) => row.platform === "linkedin_company") as unknown as PageRow[]);
  // Switched-off pages are listed only for the settings card, which needs them to switch one back on.
  const accounts = rows.filter((row) => row.is_active === true || (includeInactive && row.platform === "linkedin_company")).map((account) => ({
    id: account.id,
    platform: account.platform as "linkedin_personal" | "linkedin_company",
    kind: account.platform === "linkedin_company" ? "company_page" as const : "personal" as const,
    accountName: account.account_name || (account.platform === "linkedin_company" ? "LinkedIn page" : "LinkedIn profile"),
    accountId: account.account_id,
    active: account.is_active === true,
    isDefault: account.platform === "linkedin_company" && defaultPage?.id === account.id,
    usable: account.is_active === true && !!account.account_id && !!account.access_token_encrypted && !!account.token_expires_at && Date.parse(account.token_expires_at) > Date.now(),
    expiresAt: account.token_expires_at,
  }));
  const personal = accounts.filter((account) => account.kind === "personal");
  const usable = personal.find((account) => account.usable);
  const first = personal[0];
  return NextResponse.json({
    configured: !!linkedInApp() && !!oauthStateSecret(),
    // True once the connection goes through the app that can post as a company page.
    companyPagesSupported: linkedInApp()?.app === "publisher",
    accounts,
    connected: !!usable,
    accountName: usable?.accountName || first?.accountName || null,
    expired: !!first && !!first.accountId && !first.usable && !!first.expiresAt,
    noToken: !!first && !first.accountId,
  });
}


/**
 * Settings for a company's LinkedIn pages: which page is the default, and which are switched on.
 * set_default needs a switched-on page; the default page cannot be switched off; switching a
 * page on or off never changes the default.
 */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; socialAccountId?: string; action?: string } | null;
  if (!body?.companyId || !body.socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });
  if (!["set_default", "switch_on", "switch_off"].includes(body.action || "")) return NextResponse.json({ error: "Choose set_default, switch_on or switch_off." }, { status: 400 });
  const auth = await authoriseChannelManager(body.companyId);
  if (!auth.ok) return auth.response;
  const supabase = await createAdminSupabaseClient();
  const { data, error: readError } = await supabase.from("company_social_accounts")
    .select("id, account_name, is_active, platform_metadata").eq("company_id", body.companyId).eq("platform", "linkedin_company");
  if (readError) return NextResponse.json({ error: "Could not read the company's LinkedIn pages." }, { status: 500 });
  const pages = (data || []) as Array<PageRow & { platform_metadata: Record<string, unknown> | null }>;
  const target = pages.find((row) => row.id === body.socialAccountId);
  if (!target) return NextResponse.json({ error: "LinkedIn page not found." }, { status: 404 });
  const name = target.account_name || "This page";
  const update = (id: string, values: Record<string, unknown>) =>
    supabase.from("company_social_accounts").update(values).eq("id", id).eq("company_id", body.companyId!).eq("platform", "linkedin_company");

  if (body.action === "switch_on") {
    const { error } = await update(target.id, { is_active: true });
    if (error) return NextResponse.json({ error: "Could not switch this page on." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "switch_off") {
    if (isFlaggedDefault(target) || resolveDefaultPage(pages)?.id === target.id) {
      return NextResponse.json({ error: `${name} is the default page. Make another page the default before switching it off.` }, { status: 409 });
    }
    const { error } = await update(target.id, { is_active: false });
    if (error) return NextResponse.json({ error: "Could not switch this page off." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (target.is_active !== true) return NextResponse.json({ error: `${name} is switched off. Switch it on before making it the default.` }, { status: 409 });
  // Set the new default first: if the second write fails, two flags resolve to no default, which refuses posting rather than guessing.
  const { error: setError } = await update(target.id, { platform_metadata: withDefaultFlag(target.platform_metadata, true) });
  if (setError) return NextResponse.json({ error: "Could not set the default page." }, { status: 500 });
  for (const other of pages.filter((row) => row.id !== target.id && isFlaggedDefault(row))) {
    const { error } = await update(other.id, { platform_metadata: withDefaultFlag(other.platform_metadata, false) });
    if (error) return NextResponse.json({ error: "The default was set, but another page still carries the default flag. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** An admin, or a client of the company with the publish right, withdraws one company-owned LinkedIn grant without deleting publishing history. */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; socialAccountId?: string } | null;
  if (!body?.companyId || !body.socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });
  const auth = await authoriseChannelManager(body.companyId);
  if (!auth.ok) return auth.response;
  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts").select("id, platform, account_id")
    .eq("id", body.socialAccountId).eq("company_id", body.companyId).in("platform", [...LINKEDIN_PLATFORMS]).maybeSingle();
  if (!account) return NextResponse.json({ error: "LinkedIn account not found." }, { status: 404 });
  const { error } = await supabase.from("company_social_accounts")
    .update({ is_active: false, access_token_encrypted: null, refresh_token_encrypted: null })
    .eq("id", account.id).eq("company_id", body.companyId).eq("platform", account.platform);
  if (error) return NextResponse.json({ error: "Could not disconnect this LinkedIn account." }, { status: 500 });
  // Pages connected through this profile hold its token, so withdrawing the profile withdraws them too.
  if (account.platform === "linkedin_personal" && account.account_id) {
    const { error: pagesError } = await supabase.from("company_social_accounts")
      .update({ is_active: false, access_token_encrypted: null, refresh_token_encrypted: null })
      .eq("company_id", body.companyId).eq("platform", "linkedin_company").eq("platform_metadata->>connected_member_id", account.account_id);
    if (pagesError) return NextResponse.json({ error: "The profile was disconnected, but its LinkedIn pages could not be. Disconnect each page." }, { status: 500 });
  }
  return NextResponse.json({ disconnected: true });
}
