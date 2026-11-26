/**
 * The publish confirm step shows the post built from the job payload itself.
 *
 * The route builds one `linkedin_publish` payload and either returns it (dry
 * run) or queues it. The confirm dialog renders from that same payload, so
 * the mockup shows what the Mac publisher (linkedin_publisher.py) will send:
 *   - several images go up as ONE PDF document post (a carousel),
 *   - one image as a single image post,
 *   - a video with its thumbnail,
 *   - otherwise text only.
 */

export interface LinkedInPublishPayload {
  piece_id: string;
  /** Escaped little text, exactly as posted. */
  commentary: string;
  image_urls: string[];
  first_comment: string | null;
  /** The carousel's title on LinkedIn. The publisher falls back to the commentary's first line. */
  document_title?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
}

export type PublishPreviewMode = "pdf" | "image" | "video" | "none";

export interface PublishPreview {
  mode: PublishPreviewMode;
  /** The text the reader sees: the commentary with little-text escapes removed. */
  text: string;
  /** Pages of the carousel, or the one image. */
  imageUrls: string[];
  /** Set only for a carousel. Same rule as the publisher: the title, else the first line, max 100 characters. */
  documentTitle: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  firstComment: string | null;
}

/** LinkedIn little text to what a reader sees: drop the backslash before each reserved character. */
export function unescapeLittleText(text: string): string {
  return text.replace(/\\([\\|{}@[\]()<>#*_~])/g, "$1");
}

/** Mirrors linkedin_publisher.py: (payload.document_title or first line of commentary)[:100]. */
export function carouselTitle(payload: Pick<LinkedInPublishPayload, "commentary" | "document_title">): string {
  const firstLine = payload.commentary.trim().split(/\r?\n/)[0] || "";
  return (payload.document_title || firstLine).slice(0, 100);
}

export function publishPreviewMode(payload: Pick<LinkedInPublishPayload, "image_urls" | "video_url">): PublishPreviewMode {
  if (payload.video_url) return "video";
  const count = payload.image_urls?.length || 0;
  if (count > 1) return "pdf";
  if (count === 1) return "image";
  return "none";
}

export function linkedInPublishPreview(payload: LinkedInPublishPayload): PublishPreview {
  const mode = publishPreviewMode(payload);
  return {
    mode,
    text: unescapeLittleText(payload.commentary),
    imageUrls: mode === "pdf" || mode === "image" ? payload.image_urls : [],
    documentTitle: mode === "pdf" ? carouselTitle(payload) : null,
    videoUrl: mode === "video" ? payload.video_url || null : null,
    thumbnailUrl: mode === "video" ? payload.thumbnail_url || null : null,
    firstComment: payload.first_comment || null,
  };
}

/** A carousel's title as the route stores it: the post's first line, as the reader sees it, max 100 characters. */
export function defaultCarouselTitle(postText: string): string {
  return (postText.trim().split(/\r?\n/)[0] || "").slice(0, 100);
}
