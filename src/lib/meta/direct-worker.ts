import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { metaGraph, metaGraphPost, MetaGraphError } from "@/lib/meta/oauth";
import { isMetaPublicMediaUrl, metaMayHavePublished, toMetaCaption } from "@/lib/meta/direct-publish";

type Platform = "facebook" | "instagram";
type Payload = { provider?: string; platform?: Platform; caption?: string; image_url?: string | null };
type Job = { id: string; company_id: string; content_piece_id: string | null; social_account_id: string | null; triggered_by: string | null; publish_payload: Payload };

async function markFailed(supabase: SupabaseClient, job: Job, uncertain: boolean, status?: number, externalId?: string) {
  await supabase.from("publishing_jobs").update({ status: "failed", error_message: uncertain
    ? "Meta may have accepted this post. Check the selected Page or Instagram account before taking further action."
    : status ? `Meta rejected the post (HTTP ${status}). Correct the connection or post before creating a new post.` : "The post could not be prepared for Meta.",
    ...(externalId ? { external_id: externalId } : {}), response_payload: { outcome_uncertain: uncertain, manual_check_required: uncertain } }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running");
}

export async function waitForInstagramContainer(id: string, token: string, readStatus = metaGraph, pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const status = await readStatus(id, { fields: "status_code" }, token, 3_500);
    const code = status.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") throw new Error("Meta could not prepare the Instagram photo");
    if (attempt < 3) await pause(1_000);
  }
  throw new Error("The Instagram photo is still processing. The post was not published.");
}

/** Sends one atomically claimed Meta job after rechecking the tenant, approval, exact account and current media. */
export async function processMetaDirectJob(supabase: SupabaseClient, job: Job) {
  let phase: "prepare" | "container" | "publish" = "prepare";
  let confirmedExternalId: string | undefined;
  try {
    const platform = job.publish_payload?.platform;
    if (job.publish_payload?.provider !== "meta-direct-v1" || !["facebook", "instagram"].includes(platform || "") || !job.content_piece_id || !job.social_account_id) throw new Error("Invalid Meta job payload");
    const [{ data: piece }, { data: account }, { data: company }, { data: actor }] = await Promise.all([
      supabase.from("content_pieces").select("id,company_id,approval_status,content_type,markdown_body,title,cover_image_url").eq("id", job.content_piece_id).eq("company_id", job.company_id).maybeSingle(),
      supabase.from("company_social_accounts").select("id,company_id,platform,account_id,account_name,access_token_encrypted,is_active,platform_metadata,token_expires_at").eq("id", job.social_account_id).eq("company_id", job.company_id).eq("platform", platform).eq("is_active", true).maybeSingle(),
      supabase.from("companies").select("social_networks").eq("id", job.company_id).maybeSingle(),
      job.triggered_by ? supabase.from("users").select("id,role,company_id,can_publish").eq("id", job.triggered_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const networks = (company?.social_networks || []) as string[];
    if (!piece || piece.approval_status !== "approved" || piece.content_type !== "social_post") throw new Error("Approval or post type changed before publishing");
    if (!company || !networks.includes(platform!)) throw new Error("Meta publishing is no longer enabled for this company");
    if (!actor || (actor.role !== "admin" && (actor.company_id !== job.company_id || !actor.can_publish))) throw new Error("Publishing permission could not be confirmed");
    if (!account?.account_id || !account.access_token_encrypted) throw new Error("The selected Meta account is no longer connected");
    if (account.token_expires_at && (!Number.isFinite(Date.parse(account.token_expires_at)) || Date.parse(account.token_expires_at) <= Date.now())) throw new Error("The selected Meta account needs reconnecting");
    const metadata = (account.platform_metadata || {}) as { page_id?: string; instagram_id?: string | null };
    if (platform === "instagram" && metadata.instagram_id !== account.account_id) throw new Error("The selected Instagram connection is invalid");
    const caption = toMetaCaption(piece.markdown_body || "");
    if (!caption || caption !== job.publish_payload.caption) throw new Error("The approved post changed after it was queued");
    const [{ data: images }, { data: assets }] = await Promise.all([
      supabase.from("content_images").select("public_url,filename,sort_order,dimensions").eq("content_piece_id", piece.id),
      supabase.from("content_assets").select("asset_type,file_url,text_content,asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
    ]);
    const media = resolvePieceMedia(piece, images || [], assets || []);
    const imageUrl = media.items.find((item) => item.kind === "image")?.url || null;
    if (["video", "document", "images"].includes(media.shape) || imageUrl !== (job.publish_payload.image_url || null) || (imageUrl && !isMetaPublicMediaUrl(imageUrl))) throw new Error("The approved post media changed or is unsupported");
    if (platform === "instagram" && !imageUrl) throw new Error("Instagram publishing requires a photo");
    if (platform === "instagram" && caption.length > 2200) throw new Error("Instagram caption exceeds the supported length");
    if (imageUrl) {
      const mediaResponse = await fetch(imageUrl, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const mime = (mediaResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const size = Number(mediaResponse.headers.get("content-length") || "0");
      if (!mediaResponse.ok || !["image/jpeg", "image/png"].includes(mime) || (platform === "instagram" && mime !== "image/jpeg") || (size && size > 8_000_000)) throw new Error("This photo format or size is not supported by the selected Meta destination");
      if (!mediaResponse.body) throw new Error("The approved photo could not be checked");
      const reader = mediaResponse.body.getReader();
      let total = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > 8_000_000) { await reader.cancel(); throw new Error("This photo exceeds the supported size"); }
      }
      if (!total) throw new Error("The approved photo could not be checked");
    }
    const token = decrypt(account.access_token_encrypted);
    const pageId = platform === "facebook" ? account.account_id : metadata.page_id;
    if (!pageId) throw new Error("The selected Page is missing");
    const tokenIdentity = await metaGraph("me", { fields: "id" }, token);
    if (tokenIdentity.id !== pageId) throw new Error("The saved Meta token no longer matches its Page");
    if (platform === "instagram") {
      const page = await metaGraph(pageId, { fields: "instagram_business_account" }, token);
      if ((page.instagram_business_account as { id?: string } | undefined)?.id !== account.account_id) throw new Error("The Instagram account is no longer linked to its Page");
    }
    let externalId: string;
    phase = platform === "instagram" ? "container" : "publish";
    if (platform === "instagram") {
      const container = await metaGraphPost(`${account.account_id}/media`, { image_url: imageUrl!, caption }, token);
      if (typeof container.id !== "string" || !container.id) throw new Error("Meta did not return an Instagram media container id");
      await waitForInstagramContainer(container.id, token);
      phase = "publish";
      const published = await metaGraphPost(`${account.account_id}/media_publish`, { creation_id: container.id }, token);
      if (typeof published.id !== "string" || !published.id) throw new Error("Meta did not confirm the Instagram media id");
      externalId = published.id;
    } else {
      const published = imageUrl
        ? await metaGraphPost(`${pageId}/photos`, { url: imageUrl, caption }, token)
        : await metaGraphPost(`${pageId}/feed`, { message: caption }, token);
      const postId = platform === "facebook" && typeof published.post_id === "string" ? published.post_id : published.id;
      if (typeof postId !== "string" || !postId) throw new Error("Meta did not confirm the Facebook post id");
      externalId = postId;
    }
    confirmedExternalId = externalId;
    let externalUrl: string | null = null;
    try {
      const field = platform === "instagram" ? "permalink" : "permalink_url";
      const details = await metaGraph(externalId, { fields: field }, token);
      externalUrl = typeof details[field] === "string" ? details[field] as string : null;
    } catch { /* Provider success remains success when permalink lookup fails. */ }
    const { data: saved, error: saveError } = await supabase.from("publishing_jobs").update({ status: "published", external_id: externalId, external_url: externalUrl, published_at: new Date().toISOString(), error_message: null,
      response_payload: { confirmed: true, permalink_available: !!externalUrl } }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running").select("id").maybeSingle();
    if (saveError || !saved) { await markFailed(supabase, job, true, undefined, externalId); return "failed" as const; }
    return "published" as const;
  } catch (error) {
    const status = error instanceof MetaGraphError ? error.status : undefined;
    await markFailed(supabase, job, metaMayHavePublished(status ?? null, phase), status, confirmedExternalId);
    return "failed" as const;
  }
}
