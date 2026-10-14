import { PHOTO_MIME_TYPES, VIDEO_MIME_TYPES, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "./media-constants";

/**
 * What a picked file is, from its type and its name (browsers often leave
 * `file.type` empty for HEIC and for some .mov files).
 */

export type PickedKind = "photo" | "video" | "heic";

const HEIC_EXT = /\.(heic|heif)$/i;
const EXT_KIND: Array<[RegExp, "photo" | "video"]> = [
  [/\.(jpe?g|png|webp)$/i, "photo"],
  [/\.(mp4|mov|m4v|webm)$/i, "video"],
];

export function classifyFile(file: { name: string; type: string }): PickedKind | null {
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  if (type.startsWith("image/hei") || HEIC_EXT.test(file.name)) return "heic";
  if (PHOTO_MIME_TYPES.includes(type)) return "photo";
  if (VIDEO_MIME_TYPES.includes(type)) return "video";
  for (const [re, kind] of EXT_KIND) if (re.test(file.name)) return kind;
  return null;
}

/** Hidden and system files that arrive with a dropped folder. */
export function isJunkFile(name: string): boolean {
  return name.startsWith(".") || name === "Thumbs.db" || name === "desktop.ini";
}

export function mimeForVideo(file: { name: string; type: string }): string {
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  if (VIDEO_MIME_TYPES.includes(type)) return type;
  if (/\.mov$/i.test(file.name)) return "video/quicktime";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return "video/mp4";
}

export function mimeForPhoto(file: { name: string; type: string }): string {
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  if (PHOTO_MIME_TYPES.includes(type)) return type;
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return "image/jpeg";
}

export function jpegName(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

/** A friendly message for a file we will not take, or null when it is fine. */
export function sizeProblem(kind: "photo" | "video", bytes: number): string | null {
  if (kind === "photo" && bytes > MAX_PHOTO_BYTES) return "Photo is over 25 MB";
  if (kind === "video" && bytes > MAX_VIDEO_BYTES) return "Video is over 2 GB";
  return null;
}
