/**
 * The record that says why a blog image is there (15 Nov 2026). Mirrors the
 * sidecar JSON that AGENCY's local validate_blog_images.py reads, so the
 * portal and the local check agree. Pure: no I/O.
 */

export type BlogImageRole = "hero" | "inline" | "share";
export type BlogImageType = "diagram" | "infographic" | "photograph";

export const BLOG_IMAGE_TYPES: readonly BlogImageType[] = ["diagram", "infographic", "photograph"];

export interface BlogImageRecord {
  /** Optional: the gate takes the role from where the image is used. An explicit role that contradicts it is reported. */
  role?: BlogImageRole | string;
  /** Kept as given when it is not a known type, so the gate can report it. */
  type?: BlogImageType | string;
  passage: string;
  treatment?: string | null;
  alt?: string;
  /** The line printed under an inline image on the website (19 Nov 2026). */
  caption?: string;
}

/**
 * A record from stored JSON, or null when there is nothing usable. Never
 * throws. A missing or unknown role is kept as given (the gate uses the role
 * of the place the image is used and reports only a contradiction).
 */
export function parseImageRecord(value: unknown): BlogImageRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const record: BlogImageRecord = { passage: typeof v.passage === "string" ? v.passage : "" };
  let found = typeof v.passage === "string";
  if (typeof v.role === "string") { record.role = v.role; found = true; }
  if (typeof v.type === "string") { record.type = v.type; found = true; }
  if (typeof v.treatment === "string") { record.treatment = v.treatment; found = true; }
  else if (v.treatment === null) { record.treatment = null; found = true; }
  if (typeof v.alt === "string") { record.alt = v.alt; found = true; }
  if (typeof v.caption === "string") { record.caption = v.caption; found = true; }
  return found ? record : null;
}

export interface SidecarImage {
  file: string;
  role?: string;
  type?: string;
  passage: string;
  treatment?: string | null;
  alt?: string;
  caption?: string;
}

/** The JSON shape validate_blog_images.py reads, with absent keys omitted. */
export function toSidecar(images: Array<{ file: string; record: BlogImageRecord }>): { images: SidecarImage[] } {
  return {
    images: images.map(({ file, record }) => {
      const out: SidecarImage = { file } as SidecarImage;
      if (record.role !== undefined) out.role = record.role;
      if (record.type !== undefined) out.type = record.type;
      out.passage = record.passage;
      if (record.treatment !== undefined && record.treatment !== null) out.treatment = record.treatment;
      if (record.alt !== undefined) out.alt = record.alt;
      if (record.caption !== undefined) out.caption = record.caption;
      return out;
    }),
  };
}
