import { createHash } from "node:crypto";
import type { PieceMedia } from "@/lib/content/piece-media";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";

/** LinkedIn accepts videos up to 500 MB; the worker holds the file in memory, so stay well under. */
export const LINKEDIN_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/** LinkedIn's Videos API documents no thumbnail limit, so this is the same ceiling as a post image. */
export const LINKEDIN_THUMBNAIL_MAX_BYTES = 10 * 1024 * 1024;

/** The content types the direct LinkedIn queue takes. Deploy week plans with this list too. */
export const LINKEDIN_DIRECT_TYPES = ["social_post", "video"] as const;

export function isLinkedInDirectType(contentType: string): boolean {
  return (LINKEDIN_DIRECT_TYPES as readonly string[]).includes(contentType);
}

export type LinkedInDirectMedia = { imageUrls: string[]; videoUrl: string | null; thumbnailUrl: string | null };

/**
 * What a direct LinkedIn post may carry, decided once for the queue route and
 * the worker: a social post with text and at most one image or one video, or
 * a video piece with its one rendered video. A video always carries its
 * thumbnail, so LinkedIn never picks the frame. Media must be in our own storage.
 */
export function linkedInDirectMedia(contentType: string, media: PieceMedia): LinkedInDirectMedia | { error: string } {
  if (media.shape === "document") return { error: "Publishing documents to LinkedIn is not available yet." };
  if (media.shape === "video") {
    if (!isLinkedInDirectType(contentType)) return { error: "Only approved social posts and videos can be published to LinkedIn." };
    if (media.items.length !== 1 || media.items[0].kind !== "video") return { error: "A LinkedIn video post carries exactly one video." };
    if (!isOurStorageUrl(media.items[0].url)) return { error: "The post contains an unsupported video location." };
    if (!media.thumbnailUrl) return { error: "This video has no thumbnail. Add one before publishing to LinkedIn." };
    if (!isOurStorageUrl(media.thumbnailUrl)) return { error: "The post contains an unsupported thumbnail location." };
    return { imageUrls: [], videoUrl: media.items[0].url, thumbnailUrl: media.thumbnailUrl };
  }
  if (contentType !== "social_post") return { error: "Only approved social posts and videos can be published to LinkedIn." };
  const imageUrls = media.items.filter((item) => item.kind === "image").map((item) => item.url);
  if (imageUrls.length > 1) return { error: "This pilot supports text and one image per post." };
  if (imageUrls.some((url) => !isOurStorageUrl(url))) return { error: "The post contains an unsupported image location." };
  return { imageUrls, videoUrl: null, thumbnailUrl: null };
}

/** Stable job identity makes one piece/account pair idempotent without schema changes. */
export function directLinkedInJobId(companyId: string, pieceId: string, accountId: string): string {
  const bytes = createHash("sha256").update(`linkedin-direct-v1:${companyId}:${pieceId}:${accountId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Transport failures and 5xx responses may have happened after LinkedIn accepted a post. */
export function linkedinOutcomeMayBeUncertain(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/\((\d{3})\)/)?.[1];
  if (!status) return true;
  return Number(status) >= 500;
}
