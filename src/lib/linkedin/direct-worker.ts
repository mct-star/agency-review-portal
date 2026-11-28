import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { createPost, uploadDocument, uploadImage, uploadVideo, addComment } from "@/lib/linkedin/client";
import { LINKEDIN_PLATFORMS, LINKEDIN_THUMBNAIL_MAX_BYTES, LINKEDIN_VIDEO_MAX_BYTES, linkedInDirectMedia, linkedInFeedMismatch, linkedInOwnerUrn, linkedinOutcomeMayBeUncertain } from "@/lib/linkedin/direct-publish";
import { canCommentAs } from "@/lib/linkedin/app";
import { imagesToPdf } from "@/lib/linkedin/images-pdf";
import { defaultCarouselTitle } from "@/lib/linkedin/publish-preview";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { resolveDefaultPage, type PageRow } from "@/lib/linkedin/default-page";
import { escapeLittleText, toLinkedInText } from "@/lib/linkedin/post-text";
import { applyMentions, type MentionEntry } from "@/lib/linkedin/mentions";
import { validateLinkedInPdf } from "@/lib/linkedin/pdf-document";
import { scheduleRetry } from "@/lib/publishing/schedule-retry";

type PublishPayload = { provider?: string; commentary?: string; image_urls?: string[]; video_url?: string | null; thumbnail_url?: string | null; document_url?: string | null; first_comment?: string | null; document_title?: string | null; confirmed_non_default_page?: string | null };
type Job = { id: string; company_id: string; content_piece_id: string | null; social_account_id: string | null; triggered_by: string | null; target_platform?: string | null; publish_payload: PublishPayload };

/** A refusal whose message is safe and useful to show on the job as it is. */
class PublishRefusal extends Error {}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

async function downloadImage(url: string): Promise<{ bytes: Buffer; mediaType: string | undefined }> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("The post image could not be downloaded");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > IMAGE_MAX_BYTES) throw new Error("The post image exceeds the upload limit");
  return { bytes: Buffer.from(bytes), mediaType: response.headers.get("content-type")?.split(";")[0].trim() };
}

async function markFailure(supabase: SupabaseClient, job: Job, error: unknown, uncertain: boolean) {
  const statusCode = error instanceof Error ? error.message.match(/\((\d{3})\)/)?.[1] : null;
  const safeMessage = uncertain
    ? "LinkedIn's response was inconclusive. Check the account before taking any further action."
    : error instanceof PublishRefusal ? error.message
    : statusCode ? `LinkedIn rejected the post (HTTP ${statusCode}). Reconnect the account or correct the post before retrying.` : "The post could not be prepared for LinkedIn.";
  await supabase.from("publishing_jobs").update({
    status: "failed",
    error_message: safeMessage,
    response_payload: { outcome_uncertain: uncertain, manual_check_required: uncertain },
  }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running");
}

/** Posts one already-claimed job. A transient failure before the post was requested is retried once, five minutes on; every other result is terminal. */
export async function processLinkedInDirectJob(supabase: SupabaseClient, job: Job) {
  let createRequestStarted = false;
  try {
    if (job.publish_payload?.provider !== "linkedin-direct-v1" || !job.content_piece_id || !job.social_account_id) {
      throw new Error("Invalid direct LinkedIn job payload");
    }
    const platform = job.target_platform || "linkedin_personal";
    if (!(LINKEDIN_PLATFORMS as readonly string[]).includes(platform)) throw new Error("Invalid direct LinkedIn job platform");
    const [{ data: piece }, { data: account }, { data: company }, { data: actor }] = await Promise.all([
      supabase.from("content_pieces").select("id, company_id, approval_status, content_type, post_type, markdown_body, first_comment, title, cover_image_url")
        .eq("id", job.content_piece_id).eq("company_id", job.company_id).maybeSingle(),
      supabase.from("company_social_accounts").select("id, company_id, platform, account_id, access_token_encrypted, token_expires_at, is_active, platform_metadata")
        .eq("id", job.social_account_id).eq("company_id", job.company_id).eq("platform", platform).eq("is_active", true).maybeSingle(),
      supabase.from("companies").select("post_pack, social_networks").eq("id", job.company_id).maybeSingle(),
      job.triggered_by ? supabase.from("users").select("id, role, company_id, can_publish").eq("id", job.triggered_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!piece || piece.approval_status !== "approved") throw new Error("Approval was removed before publishing");
    const mismatch = linkedInFeedMismatch(piece.post_type, platform);
    if (mismatch) throw new PublishRefusal(mismatch);
    if (!company || !actor || (actor.role !== "admin" && (actor.company_id !== job.company_id || !actor.can_publish))) throw new Error("Publishing permission or company settings could not be confirmed");
    const networks = (company?.social_networks || []) as string[];
    if (company?.post_pack === "hospitality" || (networks.length > 0 && !networks.includes("linkedin"))) throw new Error("LinkedIn publishing is no longer enabled for this company");
    // Company page posts go to the default page unless the person who queued the job confirmed this exact page.
    // Checked again here, so a default changed after queueing cannot send a job to the wrong page.
    if (platform === "linkedin_company" && account) {
      const { data: pages, error: pagesError } = await supabase.from("company_social_accounts").select("id, account_name, is_active, platform_metadata")
        .eq("company_id", job.company_id).eq("platform", "linkedin_company");
      if (pagesError || !Array.isArray(pages)) throw new Error("The company's LinkedIn pages could not be checked");
      const def = resolveDefaultPage(pages as PageRow[]);
      if (def?.id !== account.id && job.publish_payload.confirmed_non_default_page !== account.id) {
        throw new PublishRefusal("This page is not the company's default LinkedIn page and was not confirmed when the post was queued. Queue it again and choose the page.");
      }
    }
    const expiry = account?.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
    if (!account?.account_id || !account.access_token_encrypted || !Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new Error("The selected LinkedIn connection needs reconnecting");
    }
    const commentary = escapeLittleText(toLinkedInText(piece.markdown_body || "")).trim();
    if (!commentary) throw new Error("The post has no publishable text");
    if (commentary !== job.publish_payload.commentary?.trim()) throw new Error("The approved post changed after it was queued");
    const [{ data: images }, { data: assets }] = await Promise.all([
      supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", piece.id),
      supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
    ]);
    const currentMedia = linkedInDirectMedia(piece.content_type, resolvePieceMedia(piece, images || [], assets || []));
    if ("error" in currentMedia) throw new Error("This post format is not supported by LinkedIn publishing");
    const imageUrls = job.publish_payload.image_urls || [];
    const videoUrl = job.publish_payload.video_url || null;
    const thumbnailUrl = job.publish_payload.thumbnail_url || null;
    const documentUrl = job.publish_payload.document_url || null;
    const currentFirstComment = piece.first_comment ? toLinkedInText(piece.first_comment) : null;
    if (JSON.stringify(currentMedia.imageUrls) !== JSON.stringify(imageUrls) || currentMedia.videoUrl !== videoUrl || currentMedia.thumbnailUrl !== thumbnailUrl || currentMedia.documentUrl !== documentUrl || currentFirstComment !== (job.publish_payload.first_comment || null)) throw new Error("The approved post media or comment changed after it was queued");

    const grantedScope = (account.platform_metadata as { scope?: string } | null)?.scope;
    if (job.publish_payload.first_comment && !canCommentAs(platform, grantedScope)) {
      throw new PublishRefusal("Not posted: this post has a first comment and this LinkedIn connection cannot add comments. Reconnect LinkedIn, then publish again.");
    }

    const accessToken = decrypt(account.access_token_encrypted);
    const owner = linkedInOwnerUrn(platform, account.account_id);
    let imageUrn: string | undefined;
    let videoUrn: string | undefined;
    let documentUrn: string | undefined;
    if (videoUrl) {
      if (!thumbnailUrl) throw new Error("The post video has no thumbnail");
      const thumbnailResponse = await fetch(thumbnailUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!thumbnailResponse.ok) throw new Error("The post thumbnail could not be downloaded");
      const thumbnailType = thumbnailResponse.headers.get("content-type")?.split(";")[0].trim();
      if (thumbnailType !== "image/jpeg" && thumbnailType !== "image/png") throw new Error("LinkedIn publishing needs the thumbnail as a JPEG or PNG");
      const thumbnailBytes = await thumbnailResponse.arrayBuffer();
      if (thumbnailBytes.byteLength > LINKEDIN_THUMBNAIL_MAX_BYTES) throw new Error("The post thumbnail exceeds the upload limit");
      const response = await fetch(videoUrl, { redirect: "error", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error("The post video could not be downloaded");
      if (response.headers.get("content-type")?.split(";")[0].trim() !== "video/mp4") throw new Error("LinkedIn publishing needs the video as an MP4");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > LINKEDIN_VIDEO_MAX_BYTES) throw new Error("The post video exceeds the upload limit");
      videoUrn = (await uploadVideo(accessToken, owner, Buffer.from(bytes), Buffer.from(thumbnailBytes))).videoUrn;
    } else if (documentUrl) {
      // An uploaded PDF: type, size and page count are checked on the bytes before LinkedIn sees anything.
      const response = await fetch(documentUrl, { redirect: "error", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error("The post PDF could not be downloaded");
      const bytes = Buffer.from(await response.arrayBuffer());
      const refusal = validateLinkedInPdf(bytes, response.headers.get("content-type"));
      if (refusal) throw new PublishRefusal(refusal);
      documentUrn = (await uploadDocument(accessToken, owner, bytes)).documentUrn;
    } else if (imageUrls.length > 1) {
      // Several images go up as one PDF document: LinkedIn shows it as the swipeable carousel.
      const pages: Buffer[] = [];
      for (const url of imageUrls) pages.push((await downloadImage(url)).bytes);
      documentUrn = (await uploadDocument(accessToken, owner, await imagesToPdf(pages))).documentUrn;
    } else if (imageUrls.length === 1) {
      const { bytes, mediaType } = await downloadImage(imageUrls[0]);
      const extension = mediaType === "image/png" ? "png" : mediaType === "image/gif" ? "gif" : "jpg";
      imageUrn = (await uploadImage(accessToken, owner, bytes, `linkedin-post-image.${extension}`)).imageUrn;
    }

    // Mentions are converted here and only here: the approved text and the queued payload stay exactly as approved.
    const { data: mentionRows, error: mentionsError } = await supabase.from("linkedin_mentions").select("name, urn, kind").eq("company_id", job.company_id);
    // Never publish without mentions silently: a failed lookup is a retryable error (before the post request, so the one safe retry applies).
    if (mentionsError) throw Object.assign(new Error("The mention list could not be read"), { code: "ECONNRESET" });
    const finalCommentary = applyMentions(toLinkedInText(piece.markdown_body || ""), (mentionRows || []) as MentionEntry[]).commentary;

    createRequestStarted = true;
    const posted = videoUrn
      ? await createPost(accessToken, owner, finalCommentary, videoUrn, piece.title || "Video")
      : documentUrn
      ? await createPost(accessToken, owner, finalCommentary, documentUrn, job.publish_payload.document_title || defaultCarouselTitle(toLinkedInText(piece.markdown_body || "")) || "Carousel")
      : await createPost(accessToken, owner, finalCommentary, imageUrn);
    if (!posted.postUrn || !posted.postUrl || posted.postUrn.endsWith(":share:")) throw new Error("LinkedIn accepted a post request without returning its post ID");
    // The post is live. A missing first comment is reported loudly on the job, never hidden.
    let commentError: string | null = null;
    let commentStatus: number | null = null;
    if (job.publish_payload.first_comment) {
      try { await addComment(accessToken, posted.postUrn, owner, job.publish_payload.first_comment); }
      catch (cause) {
        const status = cause instanceof Error ? cause.message.match(/\((\d{3})\)/)?.[1] : undefined;
        commentStatus = status ? Number(status) : null;
        commentError = `Published, but the first comment was not added${commentStatus ? ` (LinkedIn HTTP ${commentStatus})` : ""}. Add it on LinkedIn by hand now.`;
      }
    }
    const { error } = await supabase.from("publishing_jobs").update({
      status: "published",
      external_id: posted.postUrn,
      external_url: posted.postUrl,
      published_at: new Date().toISOString(),
      error_message: commentError,
      response_payload: commentError
        ? { comment_error: commentError, comment_failed: true, comment_status: commentStatus, manual_check_required: true }
        : { comment_error: null },
    }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running");
    if (error) throw new Error("LinkedIn accepted the post but the result could not be saved");
    return "published" as const;
  } catch (error) {
    const uncertain = createRequestStarted && linkedinOutcomeMayBeUncertain(error);
    // One safe retry for a transient failure before any post was requested.
    if (!uncertain && await scheduleRetry(supabase, job, error, createRequestStarted)) return "retrying" as const;
    await markFailure(supabase, job, error, uncertain);
    return uncertain ? "uncertain" as const : "failed" as const;
  }
}
