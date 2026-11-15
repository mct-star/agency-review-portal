import { runBlogGate, type BlogGateReport } from "@/lib/publishing/blog-gate";
import { blogImagesForGate, type GateImage, type LegacyCover, type UnplacedImage } from "@/lib/publishing/blog-gate-input";
import { resolveBlogGateSettings, type CompanyBlogGateSettings } from "@/lib/publishing/blog-gate-settings";
import { BLOG_IMAGE_TYPES, parseImageRecord, type BlogImageRecord, type BlogImageRole } from "@/lib/publishing/blog-image-record";

/**
 * What the blog image panel shows (15 Nov 2026): the piece's images as they
 * would publish, the company's gate settings and the gate's verdict. Shared
 * by /api/content/[pieceId]/blog-images and the piece page. The caller has
 * already authorised the piece; every read here is scoped to it.
 */

export interface BlogImagesPayload {
  images: GateImage[];
  unplaced: UnplacedImage[];
  legacyCover: LegacyCover | null;
  settings: CompanyBlogGateSettings;
  report: BlogGateReport;
}

export interface BlogPieceForImages {
  id: string;
  company_id: string;
  title: string | null;
  markdown_body: string | null;
}

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const IMAGE_COLUMNS = "id, archetype, public_url, filename, storage_path, dimensions, image_record, sort_order";

export async function loadBlogImagesPayload(
  supabase: Reader, piece: BlogPieceForImages,
): Promise<BlogImagesPayload | { error: string }> {
  const [{ data: rows, error }, settings] = await Promise.all([
    supabase.from("content_images").select(IMAGE_COLUMNS).eq("content_piece_id", piece.id).order("sort_order", { ascending: true }),
    resolveBlogGateSettings(supabase, piece.company_id),
  ]);
  if (error) return { error: "The images for this piece could not be read. Try again in a minute." };
  const body = piece.markdown_body || "";
  const { images, unplaced, legacyCover } = blogImagesForGate(rows || [], body);
  const report = runBlogGate({
    pieceTitle: (piece.title || "").trim(),
    body,
    images,
    settings: {
      photographTreatment: settings.photographTreatment,
      inlineImageWordLimit: settings.inlineImageWordLimit,
      requireShareCard: settings.requireShareCard,
    },
  });
  return { images, unplaced, legacyCover, settings, report };
}

export const RECORD_LIMITS = { passage: 300, treatment: 60, alt: 300 } as const;

const FIELD_NAMES = { passage: "The passage line", treatment: "The treatment", alt: "The alt text" } as const;

// Built from code points so no long dash is typed into this file.
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

/**
 * The record to store, from what the request sent and what is stored now.
 * Fields the request leaves out keep their stored value; an empty field
 * clears it. The role always comes from where the image is used, never from
 * the request.
 */
export function mergeImageRecord(
  role: BlogImageRole, stored: unknown, input: unknown,
): { record: BlogImageRecord } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Send the record to save." };
  const v = input as Record<string, unknown>;
  const current = parseImageRecord(stored);
  const next: BlogImageRecord = { passage: current?.passage ?? "" };
  if (current?.type !== undefined) next.type = current.type;
  if (current?.treatment !== undefined && current.treatment !== null) next.treatment = current.treatment;
  if (current?.alt !== undefined) next.alt = current.alt;

  if (v.type !== undefined) {
    if (v.type === null || v.type === "") delete next.type;
    else if (typeof v.type === "string" && (BLOG_IMAGE_TYPES as readonly string[]).includes(v.type)) next.type = v.type;
    else return { error: "The type must be diagram, infographic or photograph." };
  }

  for (const field of ["passage", "treatment", "alt"] as const) {
    const raw = v[field];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== "string") return { error: `${FIELD_NAMES[field]} must be text.` };
    const text = (raw || "").trim();
    if (text.length > RECORD_LIMITS[field]) {
      return { error: `${FIELD_NAMES[field]} must be ${RECORD_LIMITS[field]} characters or fewer.` };
    }
    if (field !== "treatment" && LONG_DASH.test(text)) {
      return { error: `${FIELD_NAMES[field]} contains a long dash. Use a comma, full stop or brackets instead.` };
    }
    if (field === "passage") next.passage = text;
    else if (text) next[field] = text;
    else delete next[field];
  }

  return { record: { role, ...next } };
}

/** A failed write as a status and one plain sentence; no database detail. */
export function writeFailure(error: { message?: string } | null | undefined): { status: number; error: string } {
  const message = error?.message || "";
  if (message.includes("RELEASE_LOCKED")) {
    return { status: 409, error: "This piece has already been published, so its images cannot be changed here." };
  }
  if (message.includes("RELEASE_BUSY")) {
    return { status: 409, error: "This piece is being published right now. Try again in a minute." };
  }
  return { status: 500, error: "The change could not be saved. Try again in a minute." };
}
