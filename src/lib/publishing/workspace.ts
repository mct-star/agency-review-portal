import type { PieceMedia } from "@/lib/content/piece-media";

export type DestinationPlatform = "linkedin_personal" | "facebook" | "instagram" | "bluesky" | "threads" | "twitter" | "youtube" | "pinterest";
export type PublishingDestination = { id: string; platform: DestinationPlatform; accountName: string; usable: boolean; configured: boolean; enabled: boolean };
export type PublishingPiece = {
  id: string; title: string; content_type: string; week_id: string | null;
  preview: { linkedin: string; meta: string; social: string; firstComment: string | null };
  media: PieceMedia;
  week?: { date_start?: string; title?: string | null } | null;
};
export type PublishingDraft = { pieceId: string; accountId: string; scheduledFor: string; privacy: "private" | "unlisted" | "public"; madeForKids: "" | "yes" | "no"; boardId: string; pinLink: string };
export const EMPTY_PUBLISHING_DRAFT: PublishingDraft = { pieceId: "", accountId: "", scheduledFor: "", privacy: "private", madeForKids: "", boardId: "", pinLink: "" };

export const DESTINATION_LABELS: Record<DestinationPlatform, string> = { linkedin_personal: "LinkedIn", facebook: "Facebook", instagram: "Instagram", bluesky: "Bluesky", threads: "Threads", twitter: "X", youtube: "YouTube", pinterest: "Pinterest" };

/** Match the existing direct-publish routes before asking someone to submit. The routes still validate the current record and media. */
export function destinationIssue(piece: PublishingPiece | undefined, account: PublishingDestination): string | null {
  if (!account.usable) return "Reconnect this account in Settings.";
  if (!account.configured) return "Publishing setup is required. Open Connections in Settings.";
  if (!account.enabled) return "Ask AGENCY to enable this destination for your company.";
  if (!piece) return null;
  if (account.platform === "youtube") {
    if (!["video", "video_script"].includes(piece.content_type) || piece.media.shape !== "video" || piece.media.items.length !== 1 || piece.media.items[0].kind !== "video") return "YouTube needs an approved rendered video.";
    if (!piece.title.trim() || piece.title.length > 100) return "The video title must be between 1 and 100 characters.";
    if (!piece.preview.social.trim()) return "The approved video has no publishable description.";
    if (piece.preview.social.length > 5000) return "The video description exceeds YouTube's 5,000 character limit.";
    return null;
  }
  if (piece.content_type !== "social_post") return "Choose an approved social post for this destination.";
  if (!["none", "image"].includes(piece.media.shape)) return "This destination supports text or one image. Open the content for other publishing options.";
  if (["instagram", "pinterest"].includes(account.platform) && piece.media.shape !== "image") return `${DESTINATION_LABELS[account.platform]} needs one image.`;
  const text = publishingText(piece, account.platform);
  if (!text.trim()) return "The approved post has no publishable text.";
  if (account.platform === "instagram" && text.length > 2200) return "Instagram captions must be 2,200 characters or fewer.";
  if (account.platform === "threads" && text.length > 500) return "Threads text must be 500 characters or fewer.";
  return null;
}

export function publishingText(piece: PublishingPiece, platform: DestinationPlatform): string {
  return platform === "linkedin_personal" ? piece.preview.linkedin : ["facebook", "instagram"].includes(platform) ? piece.preview.meta : piece.preview.social;
}

export function publishingEndpoint(platform: DestinationPlatform): string {
  return platform === "linkedin_personal" ? "/api/publish/linkedin-direct" : ["facebook", "instagram"].includes(platform) ? "/api/publish/meta" : "/api/publish/social";
}

export function scheduleIssue(value: string, now = Date.now()): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now ? "Choose a future date and time, or clear the time to queue now." : null;
}

/** Store selection identifiers and options only, scoped to the signed-in user and company. Never store post bodies or credentials. */
export function publishingDraftKey(userId: string, companyId: string) { return `agency:publishing:v1:${userId}:${companyId}`; }

export function readPublishingDraft(storage: Pick<Storage, "getItem">, userId: string, companyId: string): PublishingDraft {
  try {
    const value: unknown = JSON.parse(storage.getItem(publishingDraftKey(userId, companyId)) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_PUBLISHING_DRAFT };
    const saved = value as Record<string, unknown>;
    const draft = { ...EMPTY_PUBLISHING_DRAFT };
    for (const key of ["pieceId", "accountId", "scheduledFor", "boardId", "pinLink"] as const) if (typeof saved[key] === "string" && saved[key].length <= 2000) draft[key] = saved[key];
    if (["private", "unlisted", "public"].includes(String(saved.privacy))) draft.privacy = saved.privacy as PublishingDraft["privacy"];
    if (["", "yes", "no"].includes(String(saved.madeForKids))) draft.madeForKids = saved.madeForKids as PublishingDraft["madeForKids"];
    return draft;
  } catch { return { ...EMPTY_PUBLISHING_DRAFT }; }
}

export function publishingStatus(job: { status: string; needs_checking?: boolean; response_payload?: { outcome_uncertain?: boolean } | null }): string {
  if (job.needs_checking || job.response_payload?.outcome_uncertain) return "Needs checking";
  return ({ queued: "Queued", scheduled: "Scheduled", running: "Publishing", published: "Published", failed: "Failed", cancelled: "Cancelled" } as Record<string, string>)[job.status] || job.status;
}
