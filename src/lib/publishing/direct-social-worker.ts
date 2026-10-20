import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import {
  DIRECT_SOCIAL_JOB_MARKER,
  type DirectSocialAccount,
  type DirectSocialAdapter,
  type DirectSocialCredentials,
  type DirectSocialMedia,
  type DirectSocialPlatform,
  isDirectSocialPlatform,
  isDirectSocialPublicMediaUrl,
  toDirectSocialText,
  validateDirectSocialOptions,
} from "@/lib/publishing/direct-social";

type Payload = {
  provider?: string;
  platform?: DirectSocialPlatform;
  account_id?: string;
  text?: string;
  title?: string | null;
  media?: DirectSocialMedia | null;
  options?: Record<string, unknown>;
};

export type DirectSocialJob = {
  id: string;
  company_id: string;
  content_piece_id: string | null;
  social_account_id: string | null;
  triggered_by: string | null;
  target_platform?: string;
  publish_payload: Payload;
};

type Result = "published" | "failed" | "uncertain";

async function markFailure(supabase: SupabaseClient, job: DirectSocialJob, message: string, uncertain: boolean, externalId?: string) {
  await supabase.from("publishing_jobs").update({
    status: "failed",
    error_message: message,
    response_payload: { outcome_uncertain: uncertain, manual_check_required: uncertain, ...(externalId ? { external_id: externalId } : {}) },
  }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running");
}

async function mediaHead(media: DirectSocialMedia, signal: AbortSignal) {
  if (!isDirectSocialPublicMediaUrl(media.url)) throw new Error("The approved media must be an unsigned public portal storage object.");
  const response = await fetch(media.url, { method: "HEAD", redirect: "error", cache: "no-store", signal });
  if (!response.ok) throw new Error("The approved media could not be checked.");
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentLengthValue = response.headers.get("content-length");
  const contentLength = contentLengthValue ? Number(contentLengthValue) : null;
  if (!mimeType || (contentLength !== null && (!Number.isFinite(contentLength) || contentLength <= 0))) throw new Error("The approved media metadata is invalid.");
  return { mimeType, contentLength };
}

/** Rechecks an atomic claim against current approval, tenant, account, permissions and snapshot before dispatch. */
export async function processDirectSocialJob(
  supabase: SupabaseClient,
  job: DirectSocialJob,
  resolveAdapter: (platform: DirectSocialPlatform) => DirectSocialAdapter | null,
) {
  let publishStarted = false;
  try {
    const payload = job.publish_payload;
    const platform = payload?.platform;
    if (payload?.provider !== DIRECT_SOCIAL_JOB_MARKER || !isDirectSocialPlatform(platform) || job.target_platform !== platform || !job.content_piece_id || !job.social_account_id) throw new Error("Invalid direct social queue item.");
    const options = validateDirectSocialOptions(platform, payload.options ?? {});
    if (!options || JSON.stringify(options) !== JSON.stringify(payload.options || {})) throw new Error("The queued publishing options are invalid.");
    const adapter = resolveAdapter(platform);
    if (!adapter) throw new Error("This publishing destination is not configured.");
    const [{ data: piece }, { data: accountRow }, { data: company }, { data: actor }] = await Promise.all([
      supabase.from("content_pieces").select("id,company_id,approval_status,content_type,markdown_body,title,cover_image_url")
        .eq("id", job.content_piece_id).eq("company_id", job.company_id).maybeSingle(),
      supabase.from("company_social_accounts").select("id,company_id,platform,account_id,account_name,access_token_encrypted,refresh_token_encrypted,token_expires_at,is_active,platform_metadata")
        .eq("id", job.social_account_id).eq("company_id", job.company_id).eq("platform", platform).eq("is_active", true).maybeSingle(),
      supabase.from("companies").select("social_networks,post_pack").eq("id", job.company_id).maybeSingle(),
      job.triggered_by ? supabase.from("users").select("id,role,company_id,can_publish").eq("id", job.triggered_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!piece || piece.approval_status !== "approved") throw new Error("Approval was removed before publishing.");
    if (!company || !actor || (actor.role !== "admin" && (actor.company_id !== job.company_id || !actor.can_publish))) throw new Error("Publishing permission could not be confirmed.");
    if (company.post_pack === "hospitality" && actor.role !== "admin") throw new Error("Direct social publishing is not available for this company pack.");
    const network = platform === "twitter" ? "x" : platform;
    const enabled = Array.isArray(company.social_networks) ? company.social_networks as string[] : [];
    if (!enabled.includes(network)) throw new Error("This destination is no longer enabled for the company.");
    if (!accountRow?.account_id || accountRow.account_id !== payload.account_id || !accountRow.access_token_encrypted) throw new Error("The selected account needs reconnecting.");
    const expiry = accountRow.token_expires_at ? Date.parse(accountRow.token_expires_at) : null;
    if (expiry !== null && !Number.isFinite(expiry)) throw new Error("The selected account has an invalid expiry and needs reconnecting.");
    const metadata = (accountRow.platform_metadata || {}) as Record<string, unknown>;
    const oauthRefreshable = platform === "bluesky" && metadata.auth_method === "atproto_oauth";
    if (expiry !== null && expiry <= Date.now() && !accountRow.refresh_token_encrypted && !oauthRefreshable) {
      throw new Error("The selected account has expired and needs reconnecting.");
    }
    if (expiry !== null && expiry <= Date.now() && platform === "threads") throw new Error("The Threads connection has expired and needs reconnecting.");

    const [{ data: images }, { data: assets }] = await Promise.all([
      supabase.from("content_images").select("public_url,filename,sort_order,dimensions").eq("content_piece_id", piece.id),
      supabase.from("content_assets").select("asset_type,file_url,text_content,asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
    ]);
    const mediaResolved = resolvePieceMedia(piece, images || [], assets || []);
    const text = toDirectSocialText(piece.markdown_body || "");
    const title = typeof piece.title === "string" && piece.title.trim() ? piece.title.trim() : null;
    if (!text || text !== payload.text || title !== (payload.title || null)) throw new Error("Approved copy or title changed after it was queued.");
    let media: DirectSocialMedia | null = null;
    if (platform === "youtube") {
      if (piece.content_type !== "video" && piece.content_type !== "video_script") throw new Error("YouTube requires an approved video item.");
      if (mediaResolved.shape !== "video" || mediaResolved.items.length !== 1 || mediaResolved.items[0].kind !== "video") throw new Error("YouTube requires an approved rendered video asset.");
    } else {
      if (piece.content_type !== "social_post") throw new Error("Only approved social posts can publish to this destination.");
      if (mediaResolved.shape === "images" || mediaResolved.shape === "document" || mediaResolved.shape === "video") throw new Error("This destination supports text or one image only.");
    }
    if (mediaResolved.items.length) {
      const item = mediaResolved.items[0];
      if ((item.kind !== "image" && item.kind !== "video") || !isDirectSocialPublicMediaUrl(item.url)) throw new Error("The approved media location is not supported.");
      const base: Omit<DirectSocialMedia, "mimeType"> = { url: item.url, kind: item.kind };
      const metadata = await mediaHead({ ...base, mimeType: "" }, AbortSignal.timeout(platform === "youtube" ? 15_000 : 10_000));
      media = { ...base, mimeType: metadata.mimeType };
      if (JSON.stringify(media) !== JSON.stringify(payload.media || null)) throw new Error("Approved media changed after it was queued.");
      if (platform === "youtube" && item.kind !== "video") throw new Error("YouTube needs an approved rendered video.");
      if (platform !== "youtube" && (item.kind !== "image" || !metadata.mimeType.startsWith("image/"))) throw new Error("This destination supports one image only.");
    } else if (payload.media) {
      throw new Error("Approved media changed after it was queued.");
    }
    if (platform === "youtube" && !media) throw new Error("YouTube needs an approved rendered video.");
    if ((platform === "pinterest" || platform === "youtube") && !title) throw new Error("This destination requires an approved title.");

    const account: DirectSocialAccount = {
      id: accountRow.id,
      companyId: job.company_id,
      platform,
      accountId: accountRow.account_id,
      accountName: accountRow.account_name || platform,
      platformMetadata: (accountRow.platform_metadata || {}) as Record<string, unknown>,
      isActive: true,
    };
    let currentAccessCipher = accountRow.access_token_encrypted;
    const persistCredentials = async (rotated: DirectSocialCredentials) => {
      const nextAccessCipher = encrypt(rotated.accessToken);
      const { error, data } = await supabase.from("company_social_accounts").update({
        access_token_encrypted: nextAccessCipher,
        refresh_token_encrypted: rotated.refreshToken ? encrypt(rotated.refreshToken) : null,
        token_expires_at: rotated.expiresAt,
        platform_metadata: { ...(account.platformMetadata || {}), ...(rotated.providerMetadata || {}) },
      }).eq("id", account.id).eq("company_id", job.company_id).eq("platform", platform)
        .eq("account_id", payload.account_id).eq("access_token_encrypted", currentAccessCipher).eq("is_active", true).select("id").maybeSingle();
      if (error || !data) throw new Error("The refreshed account session could not be saved.");
      currentAccessCipher = nextAccessCipher;
    };
    const credentials: DirectSocialCredentials = {
      accessToken: decrypt(accountRow.access_token_encrypted),
      refreshToken: accountRow.refresh_token_encrypted ? decrypt(accountRow.refresh_token_encrypted) : null,
      expiresAt: accountRow.token_expires_at,
      providerMetadata: account.platformMetadata || {},
    };
    const signal = AbortSignal.timeout(platform === "youtube" ? 290_000 : 45_000);
    const input = { account, credentials, text, title, media, options, signal, onCredentialsRefreshed: persistCredentials };
    const refreshed = await adapter.refreshIfNeeded(input);
    if (refreshed.kind === "refreshed") {
      if (!refreshed.credentials.accessToken || (refreshed.credentials.expiresAt && (!Number.isFinite(Date.parse(refreshed.credentials.expiresAt)) || Date.parse(refreshed.credentials.expiresAt) <= Date.now()))) throw new Error("The account refresh did not return a usable session.");
      await persistCredentials(refreshed.credentials);
      input.credentials = refreshed.credentials;
    }
    if (input.credentials.expiresAt) {
      const currentExpiry = Date.parse(input.credentials.expiresAt);
      if (!Number.isFinite(currentExpiry) || currentExpiry <= Date.now()) throw new Error("The selected account needs reconnecting.");
    }

    const [{ data: currentPiece }, { data: currentAccount }, { data: currentActor }, { data: currentCompany }] = await Promise.all([
      supabase.from("content_pieces").select("id,company_id,approval_status,content_type,markdown_body,title,cover_image_url")
        .eq("id", job.content_piece_id).eq("company_id", job.company_id).maybeSingle(),
      supabase.from("company_social_accounts").select("id,company_id,platform,account_id,is_active")
        .eq("id", account.id).eq("company_id", job.company_id).eq("platform", platform).eq("is_active", true).maybeSingle(),
      job.triggered_by ? supabase.from("users").select("id,role,company_id,can_publish").eq("id", job.triggered_by).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("companies").select("social_networks,post_pack").eq("id", job.company_id).maybeSingle(),
    ]);
    if (!currentPiece || currentPiece.approval_status !== "approved" || toDirectSocialText(currentPiece.markdown_body || "") !== payload.text || (currentPiece.title?.trim() || null) !== (payload.title || null)) throw new Error("Approval or approved content changed before publishing.");
    if (!currentAccount || currentAccount.account_id !== payload.account_id || !currentActor || (currentActor.role !== "admin" && (currentActor.company_id !== job.company_id || !currentActor.can_publish))) throw new Error("Publishing permission or selected account changed before dispatch.");
    const currentNetworks = Array.isArray(currentCompany?.social_networks) ? currentCompany.social_networks as string[] : [];
    if (!currentNetworks.includes(network) || (currentCompany?.post_pack === "hospitality" && currentActor.role !== "admin")) throw new Error("This destination is no longer available for the company.");

    publishStarted = true;
    const result = await adapter.publish(input);
    if (result.kind === "not-published") {
      await markFailure(supabase, job, result.message, false);
      return "failed" as const;
    }
    if (result.kind === "uncertain") {
      await markFailure(supabase, job, result.message, true);
      return "uncertain" as const;
    }
    if (!result.externalId) {
      await markFailure(supabase, job, "The provider did not confirm a post ID. Check the account before taking further action.", true);
      return "uncertain" as const;
    }
    const { error: saveError, data: saved } = await supabase.from("publishing_jobs").update({
      status: "published",
      external_id: result.externalId,
      external_url: result.externalUrl || null,
      published_at: new Date().toISOString(),
      error_message: null,
      response_payload: { confirmed: true, permalink_available: !!result.externalUrl },
    }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running").select("id").maybeSingle();
    if (saveError || !saved) {
      await markFailure(supabase, job, "The provider accepted the post but its result could not be saved. Check the account before taking further action.", true, result.externalId);
      return "uncertain" as const;
    }
    return "published" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The post could not be prepared.";
    const uncertain = publishStarted;
    await markFailure(supabase, job, uncertain ? "The provider may have accepted the post. Check the account before taking further action." : message, uncertain);
    return uncertain ? "uncertain" as const : "failed" as const;
  }
}
