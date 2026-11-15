/**
 * The record that says why a blog image is there (15 Nov 2026). Mirrors the
 * sidecar JSON that AGENCY's local validate_blog_images.py reads, so the
 * portal and the local check agree. Pure: no I/O.
 */

export type BlogImageRole = "hero" | "inline" | "share";
export type BlogImageType = "diagram" | "infographic" | "photograph";

export const BLOG_IMAGE_TYPES: readonly BlogImageType[] = ["diagram", "infographic", "photograph"];

export interface BlogImageRecord {
  role: BlogImageRole;
  /** Kept as given when it is not a known type, so the gate can report it. */
  type?: BlogImageType;
  passage: string;
  treatment?: string | null;
  alt?: string;
}

const ROLES: readonly string[] = ["hero", "inline", "share"];

/** A record from stored JSON, or null when there is nothing usable. Never throws. */
export function parseImageRecord(value: unknown): BlogImageRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.role !== "string" || !ROLES.includes(v.role)) return null;
  const record: BlogImageRecord = {
    role: v.role as BlogImageRole,
    passage: typeof v.passage === "string" ? v.passage : "",
  };
  if (typeof v.type === "string") record.type = v.type as BlogImageType;
  if (typeof v.treatment === "string") record.treatment = v.treatment;
  else if (v.treatment === null) record.treatment = null;
  if (typeof v.alt === "string") record.alt = v.alt;
  return record;
}

export interface SidecarImage {
  file: string;
  role: BlogImageRole;
  type?: string;
  passage: string;
  treatment?: string | null;
  alt?: string;
}

/** The JSON shape validate_blog_images.py reads, with absent keys omitted. */
export function toSidecar(images: Array<{ file: string; record: BlogImageRecord }>): { images: SidecarImage[] } {
  return {
    images: images.map(({ file, record }) => {
      const out: SidecarImage = { file, role: record.role } as SidecarImage;
      if (record.type !== undefined) out.type = record.type;
      out.passage = record.passage;
      if (record.treatment !== undefined && record.treatment !== null) out.treatment = record.treatment;
      if (record.alt !== undefined) out.alt = record.alt;
      return out;
    }),
  };
}
