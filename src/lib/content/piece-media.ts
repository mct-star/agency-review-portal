/**
 * What media a piece carries when it goes out, decided once.
 *
 * Images reach a piece three ways: the portal's generator writes
 * content_images, the Mac's card and photo writers set cover_image_url and a
 * content_assets row, and rendered videos arrive as content_assets with
 * asset_metadata.type "rendered_video". Every preview and every publish
 * route calls resolvePieceMedia, so the preview shows exactly what posts.
 *
 * Precedence: a rendered video wins (a video post is the video); then the
 * content_images set, in sort order (several images is a multi-image post);
 * then the cover image; then an image asset. Nothing else is guessed.
 */

export type MediaKind = "image" | "video" | "document";

export interface MediaItem {
  kind: MediaKind;
  url: string;
  alt: string;
  /** e.g. "1080x1350" when known. */
  dimensions?: string | null;
}

export interface PieceMedia {
  /** What LinkedIn will receive: none, one image, several images, a video, or a document. */
  shape: "none" | "image" | "images" | "video" | "document";
  items: MediaItem[];
  /** The still a video shows before it plays. Only a video post has one. */
  thumbnailUrl?: string;
}

export interface MediaSourcePiece {
  title?: string | null;
  cover_image_url?: string | null;
}
export interface MediaSourceImage {
  public_url: string;
  filename?: string | null;
  sort_order?: number | null;
  dimensions?: string | null;
}
export interface MediaSourceAsset {
  asset_type: string;
  file_url?: string | null;
  text_content?: string | null;
  asset_metadata?: Record<string, unknown> | null;
}

const IMAGE_ASSET_TYPES = new Set(["featured_image", "social_share_image", "cover_image", "header_image", "in_article_image"]);

/** A web address that can stand as a thumbnail: never another video file. */
function thumbnailOrNull(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed) || /\.(mp4|mov|m4v|webm)(\?|#|$)|drive\.google\.com\/uc\?/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * A video's thumbnail, from where each writer leaves it: the Mac's render on
 * the video asset itself (asset_metadata.thumbnailUrl), the portal's render as
 * its own asset (asset_metadata.type "video_thumbnail"), or the piece's cover
 * image. Nothing else is guessed.
 */
function videoThumbnail(piece: MediaSourcePiece, video: MediaSourceAsset, assets: MediaSourceAsset[]): string | null {
  return (
    thumbnailOrNull(video.asset_metadata?.thumbnailUrl) ??
    thumbnailOrNull(assets.find((a) => a.asset_metadata?.type === "video_thumbnail")?.file_url) ??
    thumbnailOrNull(piece.cover_image_url)
  );
}

export function resolvePieceMedia(
  piece: MediaSourcePiece,
  images: MediaSourceImage[] = [],
  assets: MediaSourceAsset[] = [],
): PieceMedia {
  const alt = piece.title || "";

  const video = assets.find((a) => a.file_url && a.asset_metadata?.type === "rendered_video");
  if (video?.file_url) {
    const items: MediaItem[] = [{ kind: "video", url: video.file_url, alt: video.text_content || alt }];
    const thumbnailUrl = videoThumbnail(piece, video, assets);
    return thumbnailUrl ? { shape: "video", items, thumbnailUrl } : { shape: "video", items };
  }

  const ordered = [...images]
    .filter((i) => i.public_url)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (ordered.length > 0) {
    const items = ordered.map((i) => ({ kind: "image" as const, url: i.public_url, alt, dimensions: i.dimensions ?? null }));
    return { shape: items.length > 1 ? "images" : "image", items };
  }

  if (piece.cover_image_url) {
    return { shape: "image", items: [{ kind: "image", url: piece.cover_image_url, alt }] };
  }

  const imageAsset = assets.find((a) => a.file_url && IMAGE_ASSET_TYPES.has(a.asset_type));
  if (imageAsset?.file_url) {
    return { shape: "image", items: [{ kind: "image", url: imageAsset.file_url, alt: imageAsset.text_content || alt }] };
  }

  const pdf = assets.find((a) => a.file_url && a.asset_type === "pdf_file");
  if (pdf?.file_url) {
    return { shape: "document", items: [{ kind: "document", url: pdf.file_url, alt: pdf.text_content || alt }] };
  }

  return { shape: "none", items: [] };
}
