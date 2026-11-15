import type { BlogImageRecord, BlogImageRole } from "@/lib/publishing/blog-image-record";
import { BLOG_IMAGE_TYPES } from "@/lib/publishing/blog-image-record";

/**
 * The blog image gate (15 Nov 2026): AGENCY's local validate_blog_images.py
 * as pure functions, with plain-word problems a client can act on. Nothing
 * here reads or writes anything; the caller passes the images exactly as
 * they would publish, and measures them first.
 */

export interface BlogGateSettings {
  /** The treatment every photograph must carry; null means none is required. */
  photographTreatment: string | null;
  /** A blog over this many words needs an inline image; null means no limit. */
  inlineImageWordLimit: number | null;
  requireShareCard: boolean;
}

export const DEFAULT_BLOG_GATE_SETTINGS: BlogGateSettings = {
  photographTreatment: null,
  inlineImageWordLimit: 900,
  requireShareCard: true,
};

/** Settings from stored JSON, falling back to the defaults field by field. */
export function parseBlogGateSettings(value: unknown): BlogGateSettings {
  const d = DEFAULT_BLOG_GATE_SETTINGS;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...d };
  const v = value as Record<string, unknown>;
  const treatment = v.photographTreatment;
  const limit = v.inlineImageWordLimit;
  return {
    photographTreatment:
      typeof treatment === "string" && treatment.trim() ? treatment.trim()
      : treatment === null ? null : d.photographTreatment,
    inlineImageWordLimit:
      typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit
      : limit === null ? null : d.inlineImageWordLimit,
    requireShareCard: typeof v.requireShareCard === "boolean" ? v.requireShareCard : d.requireShareCard,
  };
}

export interface BlogGateImage {
  /** How to name it to a person: "the hero image", "inline image 2", "the share image". */
  label: string;
  role: BlogImageRole;
  /** A file name or URL, compared by base name without query, lower case. */
  file: string;
  record: BlogImageRecord | null;
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
}

export interface BlogGateInput {
  pieceTitle: string;
  body: string;
  images: BlogGateImage[];
  settings: BlogGateSettings;
}

export interface BlogGateCheck {
  code: string;
  label: string;
  passed: boolean;
  problems: string[];
}

export interface BlogGateReport {
  checks: BlogGateCheck[];
  /** Every failure, flattened in check order. */
  problems: string[];
}

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

/** A file's base name without quotes or query, lower case. */
export function normaliseImageFile(p: string): string {
  const base = (p || "").trim().replace(/^["']+|["']+$/g, "").split("?")[0].split("/").pop() || "";
  return base.toLowerCase();
}

/** Words as the local script counts them: non-space runs, markdown images and [[image: ...]] slots removed. */
export function countBlogWords(body: string): number {
  const text = (body || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[\s*image:[^\]]*\]\]/gi, " ");
  return (text.match(/\S+/g) || []).length;
}

// Built from code points so no long dash is typed into this file.
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

export function runBlogGate(input: BlogGateInput): BlogGateReport {
  const { pieceTitle, body, images, settings } = input;
  const piece = `Blog "${pieceTitle}"`;
  const withRecord = images.filter(i => i.record);
  const editorial = withRecord.filter(i => i.role === "hero" || i.role === "inline");
  const checks: BlogGateCheck[] = [];
  const add = (code: string, label: string, problems: string[], notRequired = false) =>
    checks.push({ code, label: notRequired ? `${label} (not required)` : label, passed: problems.length === 0, problems });

  add("records", "Every image has a record",
    images.filter(i => !i.record).map(i =>
      `${piece}: ${i.label} has no image record. Add what it shows and the passage it serves.`));

  add("type", "Hero and inline images have a type",
    editorial.filter(i => !i.record!.type || !BLOG_IMAGE_TYPES.includes(i.record!.type)).map(i =>
      `${piece}: ${i.label} has ${i.record!.type ? `the type "${i.record!.type}"` : "no type"}. Set it to diagram, infographic or photograph.`));

  add("passage", "Every record has a passage line",
    withRecord.filter(i => !(i.record!.passage || "").trim()).map(i =>
      `${piece}: ${i.label} has no passage line. Write one line on the passage it serves.`));

  const wanted = settings.photographTreatment;
  add("treatment", "Photographs carry the house treatment",
    wanted === null ? [] : editorial.filter(i => i.record!.type === "photograph" && i.record!.treatment !== wanted).map(i =>
      `${piece}: ${i.label} is a photograph without the "${wanted}" treatment. Apply the treatment before publishing.`),
    wanted === null);

  add("alt", "Every inline image has alt text",
    withRecord.filter(i => i.role === "inline" && !(i.record!.alt || "").trim()).map(i =>
      `${piece}: ${i.label} has no alt text. Describe what it shows in one line.`));

  const limit = settings.inlineImageWordLimit;
  const words = countBlogWords(body);
  const hasInline = images.some(i => i.role === "inline");
  add("inline_present", "A long blog has an inline image",
    limit === null || words <= limit || hasInline ? [] : [
      `${piece}: the blog is ${words} words, over ${limit}, and has no inline image. Add at least one inline image.`],
    limit === null);

  const shareProblems: string[] = [];
  const shares = images.filter(i => i.role === "share");
  const heroes = images.filter(i => i.role === "hero");
  if (shares.length === 0 && settings.requireShareCard) {
    shareProblems.push(`${piece}: there is no share image. Add a designed ${SHARE_WIDTH} by ${SHARE_HEIGHT} share card.`);
  }
  for (const s of shares) {
    if (s.record && s.record.role !== "share") {
      shareProblems.push(`${piece}: ${s.label} has a record for the "${s.record.role}" role. Mark its record as the share image.`);
    }
    const measured = typeof s.width === "number" && typeof s.height === "number";
    if (!measured) {
      shareProblems.push(`${piece}: ${s.label} could not be measured. Check the file opens, then try again.`);
    } else if (s.width !== SHARE_WIDTH || s.height !== SHARE_HEIGHT) {
      shareProblems.push(`${piece}: ${s.label} is ${s.width} by ${s.height}. Replace it with a ${SHARE_WIDTH} by ${SHARE_HEIGHT} card.`);
    }
    const same = heroes.some(h =>
      normaliseImageFile(h.file) === normaliseImageFile(s.file) || (!!h.sha256 && !!s.sha256 && h.sha256 === s.sha256));
    if (same) {
      shareProblems.push(`${piece}: ${s.label} is the same file as the hero image. Make the share card its own designed image.`);
    }
  }
  add("share", "The share image is present, 1200 by 630 and its own file", shareProblems,
    !settings.requireShareCard && shares.length === 0);

  const dashProblems: string[] = [];
  if (LONG_DASH.test(pieceTitle)) dashProblems.push(`${piece}: the title contains a long dash. Replace it with a comma, full stop or brackets.`);
  if (LONG_DASH.test(body)) dashProblems.push(`${piece}: the body contains a long dash. Replace it with a comma, full stop or brackets.`);
  for (const i of withRecord) {
    if (LONG_DASH.test(i.record!.alt || "")) {
      dashProblems.push(`${piece}: the alt text of ${i.label} contains a long dash. Replace it with a comma, full stop or brackets.`);
    }
  }
  add("dashes", "No long dashes in the title, body or alt text", dashProblems);

  return { checks, problems: checks.flatMap(c => c.problems) };
}
