import { NextResponse } from "next/server";
import { requireCompanyUser, requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";
import { escapeLittleText, toLinkedInText } from "@/lib/linkedin/post-text";
import { oauthStateSecret } from "@/lib/linkedin/oauth-state";
import { directLinkedInJobId } from "@/lib/linkedin/direct-publish";

/** Queue an approved LinkedIn post for one explicitly selected account. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    companyId?: string;
    pieceId?: string;
    socialAccountId?: string;
    scheduledFor?: string | null;
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
    supabase.from("content_pieces").select("id, company_id, approval_status, content_type, markdown_body, first_comment, title, cover_image_url")
      .eq("id", body.pieceId).eq("company_id", body.companyId).maybeSingle(),
    supabase.from("company_social_accounts").select("id, company_id, account_id, account_name, access_token_encrypted, token_expires_at")
      .eq("id", body.socialAccountId).eq("company_id", body.companyId).eq("platform", "linkedin_personal").eq("is_active", true).maybeSingle(),
  ]);

  if (!piece) return NextResponse.json({ error: "Approved content not found for this company" }, { status: 404 });
  if (piece.approval_status !== "approved") return NextResponse.json({ error: "Approve the post before publishing it." }, { status: 400 });
  if (piece.content_type !== "social_post") return NextResponse.json({ error: "Only approved social posts can be published in this pilot." }, { status: 422 });
  if (!account) return NextResponse.json({ error: "Choose an active LinkedIn account connected to this company." }, { status: 404 });
  const expiry = account.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
  if (!account.account_id || !account.access_token_encrypted || !Number.isFinite(expiry) || expiry <= Date.now()) {
    return NextResponse.json({ error: "This LinkedIn connection needs reconnecting before it can publish." }, { status: 409 });
  }

  const [{ data: images }, { data: assets }] = await Promise.all([
    supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", piece.id),
    supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
  ]);
  const media = resolvePieceMedia(piece, images || [], assets || []);
  if (media.shape === "video" || media.shape === "document") {
    return NextResponse.json({ error: `Publishing ${media.shape}s is not available yet.` }, { status: 422 });
  }
  const imageUrls = media.items.filter((item) => item.kind === "image").map((item) => item.url);
  if (imageUrls.length > 1) return NextResponse.json({ error: "This pilot supports text and one image per post." }, { status: 422 });
  if (imageUrls.some((url) => !isOurStorageUrl(url))) return NextResponse.json({ error: "The post contains an unsupported image location." }, { status: 400 });

  const commentary = escapeLittleText(toLinkedInText(piece.markdown_body || "")).trim();
  if (!commentary) return NextResponse.json({ error: "The post has no publishable text." }, { status: 400 });
  const jobId = directLinkedInJobId(body.companyId, piece.id, account.id);
  const queuedJob = {
    id: jobId,
    company_id: body.companyId,
    content_piece_id: piece.id,
    social_account_id: account.id,
    target_platform: "linkedin_personal",
    status: scheduledFor ? "scheduled" : "queued",
    scheduled_for: scheduledFor,
    triggered_by: profile.id,
    publish_payload: {
      provider: "linkedin-direct-v1",
      commentary,
      image_urls: imageUrls,
      first_comment: piece.first_comment ? toLinkedInText(piece.first_comment) : null,
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
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.from("company_social_accounts")
    .select("id, account_name, account_id, token_expires_at, access_token_encrypted, is_active")
    .eq("company_id", companyId).eq("platform", "linkedin_personal").eq("is_active", true);
  if (error) return NextResponse.json({ error: "Could not load LinkedIn accounts." }, { status: 500 });
  const accounts = (data || []).map((account) => ({
    id: account.id,
    accountName: account.account_name || "LinkedIn profile",
    accountId: account.account_id,
    usable: !!account.account_id && !!account.access_token_encrypted && !!account.token_expires_at && Date.parse(account.token_expires_at) > Date.now(),
    expiresAt: account.token_expires_at,
  }));
  const usable = accounts.find((account) => account.usable);
  const first = accounts[0];
  return NextResponse.json({
    configured: !!process.env.LINKEDIN_CLIENT_ID && !!oauthStateSecret(),
    accounts,
    connected: !!usable,
    accountName: usable?.accountName || first?.accountName || null,
    expired: !!first && !!first.accountId && !first.usable && !!first.expiresAt,
    noToken: !!first && !first.accountId,
  });
}


/** Administrators withdraw one company-owned LinkedIn grant without deleting publishing history. */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { companyId?: string; socialAccountId?: string } | null;
  if (!body?.companyId || !body.socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });
  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts").select("id")
    .eq("id", body.socialAccountId).eq("company_id", body.companyId).eq("platform", "linkedin_personal").maybeSingle();
  if (!account) return NextResponse.json({ error: "LinkedIn account not found." }, { status: 404 });
  const { error } = await supabase.from("company_social_accounts")
    .update({ is_active: false, access_token_encrypted: null, refresh_token_encrypted: null })
    .eq("id", account.id).eq("company_id", body.companyId).eq("platform", "linkedin_personal");
  if (error) return NextResponse.json({ error: "Could not disconnect this LinkedIn account." }, { status: 500 });
  return NextResponse.json({ disconnected: true });
}
