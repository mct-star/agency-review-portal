import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { createPost, uploadImage, addComment } from "@/lib/linkedin/client";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";
import { linkedinOutcomeMayBeUncertain } from "@/lib/linkedin/direct-publish";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { escapeLittleText, toLinkedInText } from "@/lib/linkedin/post-text";

type PublishPayload = { provider?: string; commentary?: string; image_urls?: string[]; first_comment?: string | null };
type Job = { id: string; company_id: string; content_piece_id: string | null; social_account_id: string | null; triggered_by: string | null; publish_payload: PublishPayload };

async function markFailure(supabase: SupabaseClient, job: Job, error: unknown, uncertain: boolean) {
  const statusCode = error instanceof Error ? error.message.match(/\((\d{3})\)/)?.[1] : null;
  const safeMessage = uncertain
    ? "LinkedIn's response was inconclusive. Check the account before taking any further action."
    : statusCode ? `LinkedIn rejected the post (HTTP ${statusCode}). Reconnect the account or correct the post before retrying.` : "The post could not be prepared for LinkedIn.";
  await supabase.from("publishing_jobs").update({
    status: "failed",
    error_message: safeMessage,
    response_payload: { outcome_uncertain: uncertain, manual_check_required: uncertain },
  }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running");
}

/** Posts one already-claimed job and records a terminal result without automatic retry. */
export async function processLinkedInDirectJob(supabase: SupabaseClient, job: Job) {
  let createRequestStarted = false;
  try {
    if (job.publish_payload?.provider !== "linkedin-direct-v1" || !job.content_piece_id || !job.social_account_id) {
      throw new Error("Invalid direct LinkedIn job payload");
    }
    const [{ data: piece }, { data: account }, { data: company }, { data: actor }] = await Promise.all([
      supabase.from("content_pieces").select("id, company_id, approval_status, content_type, markdown_body, first_comment, title, cover_image_url")
        .eq("id", job.content_piece_id).eq("company_id", job.company_id).maybeSingle(),
      supabase.from("company_social_accounts").select("id, company_id, account_id, access_token_encrypted, token_expires_at, is_active")
        .eq("id", job.social_account_id).eq("company_id", job.company_id).eq("platform", "linkedin_personal").eq("is_active", true).maybeSingle(),
      supabase.from("companies").select("post_pack, social_networks").eq("id", job.company_id).maybeSingle(),
      job.triggered_by ? supabase.from("users").select("id, role, company_id, can_publish").eq("id", job.triggered_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!piece || piece.approval_status !== "approved") throw new Error("Approval was removed before publishing");
    if (!company || !actor || (actor.role !== "admin" && (actor.company_id !== job.company_id || !actor.can_publish))) throw new Error("Publishing permission or company settings could not be confirmed");
    const networks = (company?.social_networks || []) as string[];
    if (company?.post_pack === "hospitality" || (networks.length > 0 && !networks.includes("linkedin"))) throw new Error("LinkedIn publishing is no longer enabled for this company");
    const expiry = account?.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
    if (!account?.account_id || !account.access_token_encrypted || !Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new Error("The selected LinkedIn connection needs reconnecting");
    }
    const commentary = escapeLittleText(toLinkedInText(piece.markdown_body || "")).trim();
    if (!commentary) throw new Error("The post has no publishable text");
    if (piece.content_type !== "social_post" || commentary !== job.publish_payload.commentary?.trim()) throw new Error("The approved post changed after it was queued");
    const [{ data: images }, { data: assets }] = await Promise.all([
      supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", piece.id),
      supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
    ]);
    const currentMedia = resolvePieceMedia(piece, images || [], assets || []);
    if (currentMedia.shape === "video" || currentMedia.shape === "document") throw new Error("This post format is not supported by LinkedIn publishing");
    const currentImageUrls = currentMedia.items.filter((item) => item.kind === "image").map((item) => item.url);
    const imageUrls = job.publish_payload.image_urls || [];
    const currentFirstComment = piece.first_comment ? toLinkedInText(piece.first_comment) : null;
    if (JSON.stringify(currentImageUrls) !== JSON.stringify(imageUrls) || currentFirstComment !== (job.publish_payload.first_comment || null)) throw new Error("The approved post media or comment changed after it was queued");
    if (imageUrls.length > 1 || imageUrls.some((url) => !isOurStorageUrl(url))) throw new Error("The post contains unsupported image media");

    const accessToken = decrypt(account.access_token_encrypted);
    let imageUrn: string | undefined;
    if (imageUrls.length === 1) {
      const response = await fetch(imageUrls[0], { redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("The post image could not be downloaded");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("The post image exceeds the upload limit");
      const mediaType = response.headers.get("content-type")?.split(";")[0].trim();
      const extension = mediaType === "image/png" ? "png" : mediaType === "image/gif" ? "gif" : "jpg";
      imageUrn = (await uploadImage(accessToken, account.account_id, Buffer.from(bytes), `linkedin-post-image.${extension}`)).imageUrn;
    }

    createRequestStarted = true;
    const posted = await createPost(accessToken, account.account_id, commentary, imageUrn);
    if (!posted.postUrn || !posted.postUrl || posted.postUrn.endsWith(":share:")) throw new Error("LinkedIn accepted a post request without returning its post ID");
    let commentError: string | null = null;
    if (job.publish_payload.first_comment) {
      try { await addComment(accessToken, posted.postUrn, account.account_id, job.publish_payload.first_comment); }
      catch { commentError = "LinkedIn accepted the post but did not add the first comment."; }
    }
    const { error } = await supabase.from("publishing_jobs").update({
      status: "published",
      external_id: posted.postUrn,
      external_url: posted.postUrl,
      published_at: new Date().toISOString(),
      error_message: commentError,
      response_payload: { comment_error: commentError },
    }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running");
    if (error) throw new Error("LinkedIn accepted the post but the result could not be saved");
    return "published" as const;
  } catch (error) {
    const uncertain = createRequestStarted && linkedinOutcomeMayBeUncertain(error);
    await markFailure(supabase, job, error, uncertain);
    return uncertain ? "uncertain" as const : "failed" as const;
  }
}
