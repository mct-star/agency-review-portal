/**
 * Shared contract for browser-direct media upload.
 *
 * The sign route enforces these, the register route re-checks them
 * against what was actually stored, and migration 033 puts the same
 * mime allowlist on the bucket itself. Three enforcement points, one
 * list, so they cannot drift apart.
 */

export const CAPTURES_BUCKET = "captures";
export const PUBLISHED_BUCKET = "content-assets";

export type MediaKind = "photo" | "video";

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * What an iPhone shoots by default. The browser converts these to JPEG
 * before upload (see heic.ts), so only JPEG, PNG and WebP ever reach
 * storage. The sign route still refuses them as a backstop, with
 * HEIC_UNSUPPORTED_MESSAGE, so any client that skips the conversion is
 * told what to change on the phone rather than shown a generic error.
 */
export const HEIC_MIME_TYPES = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
];

/** Browsers often give a HEIC file an empty or generic type, so the extension counts too. */
export const HEIC_EXTENSIONS = [".heic", ".heif"];

export const HEIC_UNSUPPORTED_MESSAGE =
  "HEIC and HEIF files cannot be processed. On iPhone, either share the photo as JPEG when you send it, or set Settings, Camera, Formats to Most Compatible and reshoot.";

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export function allowedMimeTypes(kind: MediaKind): string[] {
  return kind === "photo" ? PHOTO_MIME_TYPES : VIDEO_MIME_TYPES;
}

export function maxBytes(kind: MediaKind): number {
  return kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
}

export function isMediaKind(value: unknown): value is MediaKind {
  return value === "photo" || value === "video";
}

/**
 * Storage keys are built from user-supplied filenames, so anything
 * outside this set is replaced rather than escaped. Matches the
 * sanitiser the existing /api/upload/video route uses.
 */
export function sanitiseFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return cleaned.replace(/^\.+/, "") || "file";
}
