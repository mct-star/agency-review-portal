import type { BlogGateImage } from "@/lib/publishing/blog-gate";
import type { BlogImageRole } from "@/lib/publishing/blog-image-record";
import { parseImageRecord } from "@/lib/publishing/blog-image-record";
import { inArticleImageNumber } from "@/lib/publishing/website-blog";

/**
 * A blog piece's images as the gate sees them (15 Nov 2026): exactly the
 * images that would publish, read from the piece's content_images rows and
 * its markdown. Pure. Shared by the image record routes, the publish route
 * and the export.
 *
 * - hero: archetype hero_image_prompt.
 * - inline n: archetype in_article_image_prompt_<n> with a public_url, and
 *   only when the body has a [[image: n]] line for it. An inline image with
 *   no line does not publish, so it is not gated; it comes back in
 *   `unplaced`. A row with no public_url is skipped, as the publisher does.
 * - share: archetype share_card, the uploaded share image; when there is
 *   more than one row, the newest (by created_at, else the last in sort
 *   order), so the latest upload is the one shown and checked. The older
 *   cover_image_prompt picture is not the share image for the gate; it
 *   comes back as `legacyCover`.
 */

export const HERO_ARCHETYPE = "hero_image_prompt";
export const SHARE_ARCHETYPE = "share_card";
export const LEGACY_COVER_ARCHETYPE = "cover_image_prompt";

export interface BlogImageRow {
  id: string;
  archetype: string | null;
  public_url: string | null;
  filename?: string | null;
  dimensions?: string | null;
  image_record?: unknown;
  created_at?: string | null;
}

export interface GateImage extends BlogGateImage {
  id: string;
  publicUrl: string | null;
  /** The slot number of an inline image. */
  n?: number;
}

export interface UnplacedImage {
  id: string;
  n: number;
  label: string;
  publicUrl: string | null;
}

export interface LegacyCover {
  id: string;
  publicUrl: string | null;
}

export interface BlogGateImages {
  images: GateImage[];
  unplaced: UnplacedImage[];
  legacyCover: LegacyCover | null;
}

/** The role an archetype gives an image, or null when it is not gated. */
export function roleForArchetype(archetype: string | null | undefined): BlogImageRole | null {
  if (archetype === HERO_ARCHETYPE) return "hero";
  if (archetype === SHARE_ARCHETYPE) return "share";
  return inArticleImageNumber(archetype) !== null ? "inline" : null;
}

/** "1200x630", "1200 x 630" or "1200×630" as numbers; null for anything else. */
export function parseDimensions(value: string | null | undefined): { width: number; height: number } | null {
  const m = (value || "").trim().match(new RegExp(`^(\\d+)\\s*[xX${String.fromCharCode(0xd7)}]\\s*(\\d+)$`));
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The slot keys the body places, as the publisher reads them: a [[image: key]] on its own line. */
export function imageSlotKeys(body: string): Set<string> {
  const keys = new Set<string>();
  for (const line of (body || "").replace(/\r\n/g, "\n").split("\n")) {
    const slot = line.match(/^\s*\[\[\s*image:\s*([a-z0-9]+)\s*\]\]\s*$/i);
    if (slot) keys.add(slot[1].toLowerCase());
  }
  return keys;
}

/** The newest row by created_at; rows without one fall back to their place in sort order. */
function newest(rows: BlogImageRow[]): BlogImageRow | undefined {
  let best: BlogImageRow | undefined;
  let bestTime = -Infinity;
  for (const r of rows) {
    const t = r.created_at ? Date.parse(r.created_at) : NaN;
    const time = Number.isFinite(t) ? t : -Infinity;
    if (!best || time >= bestTime) { best = r; bestTime = time; }
  }
  return best;
}

function gateImage(row: BlogImageRow, label: string, role: BlogImageRole, n?: number): GateImage {
  const size = parseDimensions(row.dimensions);
  return {
    id: row.id,
    label,
    role,
    file: row.public_url || row.filename || "",
    record: parseImageRecord(row.image_record),
    width: size?.width ?? null,
    height: size?.height ?? null,
    publicUrl: row.public_url ?? null,
    ...(n !== undefined ? { n } : {}),
  };
}

/**
 * The images exactly as they would publish. Rows are taken in the order
 * given (sort order). The publisher uses the first hero; for an inline slot
 * the last row with a public_url for that number is the one the article
 * shows.
 */
export function blogImagesForGate(rows: BlogImageRow[], body: string): BlogGateImages {
  const slots = imageSlotKeys(body);
  const hero = rows.find(r => r.archetype === HERO_ARCHETYPE);
  const share = newest(rows.filter(r => r.archetype === SHARE_ARCHETYPE));
  const cover = rows.find(r => r.archetype === LEGACY_COVER_ARCHETYPE);

  const byNumber = new Map<number, BlogImageRow>();
  for (const r of rows) {
    const n = inArticleImageNumber(r.archetype);
    if (n !== null && r.public_url) byNumber.set(n, r);
  }
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);

  const images: GateImage[] = [];
  const unplaced: UnplacedImage[] = [];
  if (hero) images.push(gateImage(hero, "the hero image", "hero"));
  for (const n of numbers) {
    const row = byNumber.get(n)!;
    if (slots.has(String(n))) images.push(gateImage(row, `inline image ${n}`, "inline", n));
    else unplaced.push({ id: row.id, n, label: `inline image ${n}`, publicUrl: row.public_url ?? null });
  }
  if (share) images.push(gateImage(share, "the share image", "share"));

  return {
    images,
    unplaced,
    legacyCover: cover ? { id: cover.id, publicUrl: cover.public_url ?? null } : null,
  };
}
