import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET, type MediaKind } from "@/lib/upload/media-constants";
import { makeImageDerivatives, makePoster, visionCopy } from "./derivatives";
import { mergeAutoTags, unionFrameTags } from "./vocabulary";
import { tagImages, type VisionImage } from "@/lib/providers/vision/tag-image";

/**
 * Server side of putting a file into the library once it is in storage:
 * the row, the thumbnail or poster, and the automatic tags.
 *
 * Used by the signed-in register route and by the staff upload link, so
 * both land files the same way.
 */

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface LibraryDeps {
  download: (bucket: string, path: string) => Promise<Buffer>;
  upload: (bucket: string, path: string, body: Buffer, contentType: string) => Promise<void>;
  tag: typeof tagImages;
}

export function realDeps(supabase: SupabaseAdmin): LibraryDeps {
  return {
    async download(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Could not read ${path}: ${error?.message ?? "no data"}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(bucket, path, body, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
      if (error) throw new Error(`Could not store ${path}: ${error.message}`);
    },
    tag: tagImages,
  };
}

export interface StoredObject {
  name: string;
  size: number | null;
  mimetype: string | null;
}

/**
 * The object is the only proof an upload finished, so it is looked up before
 * any row is written. Its stored size and type are what get trusted, not
 * what the browser declared.
 */
export async function findStoredObject(
  supabase: SupabaseAdmin,
  bucket: string,
  path: string
): Promise<StoredObject | null> {
  const slash = path.lastIndexOf("/");
  const prefix = slash === -1 ? "" : path.slice(0, slash);
  const basename = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, search: basename });
  if (error || !data) return null;
  const entry = data.find((e) => e.name === basename);
  if (!entry) return null;
  const md = (entry.metadata ?? {}) as { size?: number; mimetype?: string };
  return { name: entry.name, size: typeof md.size === "number" ? md.size : null, mimetype: md.mimetype ?? null };
}

export function derivedPath(companyId: string, folder: "thumbs" | "posters", originalPath: string): string {
  const base = originalPath.slice(originalPath.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  return `${companyId}/${folder}/${base}.jpg`;
}

export interface RegisterLibraryInput {
  companyId: string;
  kind: MediaKind;
  path: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  source: "bank_upload" | "staff_link" | "weekly_capture" | "shoot" | "photo_pack";
  status: "approved" | "pending";
  sceneLabel?: string | null;
  submittedBy?: string | null;
  /** Up to three JPEG frames from the browser, for a video. */
  frames?: Buffer[];
}

export interface RegisterLibraryResult {
  alreadyExists: boolean;
  photo: Record<string, unknown> | null;
  /** Images to hand straight to the tagger so it does not download again. */
  visionImages: VisionImage[];
}

export async function registerLibraryItem(
  supabase: SupabaseAdmin,
  input: RegisterLibraryInput,
  deps: LibraryDeps = realDeps(supabase)
): Promise<RegisterLibraryResult> {
  const fileRef = input.sha256 ? `sha256:${input.sha256}` : input.path;

  const { data, error } = await supabase
    .from("photo_inventory")
    .insert({
      company_id: input.companyId,
      file_ref: fileRef,
      scene_label: input.sceneLabel ?? null,
      source: input.source,
      status: input.status,
      submitted_by: input.submittedBy ?? null,
      storage_path: input.path,
      bucket: CAPTURES_BUCKET,
      mime_type: input.mimeType,
      width: input.width,
      height: input.height,
      size_bytes: input.sizeBytes,
      original_filename: input.originalFilename,
      kind: input.kind,
      duration_seconds: input.durationSeconds,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 on (company_id, file_ref): this exact file is already in the
    // library. That is the dedupe working. The copy just uploaded is ours to
    // tidy up, so it is removed rather than left to count against the quota.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("photo_inventory")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("file_ref", fileRef)
        .maybeSingle();
      if (existing && existing.storage_path !== input.path) {
        await supabase.storage.from(CAPTURES_BUCKET).remove([input.path]);
      }
      return { alreadyExists: true, photo: existing ?? null, visionImages: [] };
    }
    throw new Error(`Could not register ${input.kind}: ${error.message}`);
  }

  const patch: Record<string, unknown> = {};
  let visionImages: VisionImage[] = [];

  try {
    if (input.kind === "photo") {
      const original = await deps.download(CAPTURES_BUCKET, input.path);
      const d = await makeImageDerivatives(original);
      const thumbPath = derivedPath(input.companyId, "thumbs", input.path);
      await deps.upload(CAPTURES_BUCKET, thumbPath, d.thumb, "image/jpeg");
      patch.thumb_path = thumbPath;
      if (!input.width || !input.height) {
        patch.width = d.width;
        patch.height = d.height;
      }
      visionImages = [{ mimeType: "image/jpeg", base64: d.vision.toString("base64") }];
    } else if (input.frames && input.frames.length > 0) {
      const poster = await makePoster(input.frames[Math.floor(input.frames.length / 2)]);
      const posterPath = derivedPath(input.companyId, "posters", input.path);
      await deps.upload(CAPTURES_BUCKET, posterPath, poster, "image/jpeg");
      patch.poster_path = posterPath;
      visionImages = await Promise.all(
        input.frames.map(async (f) => ({ mimeType: "image/jpeg" as const, base64: (await visionCopy(f)).toString("base64") }))
      );
    }
  } catch (err) {
    // A missing thumbnail must not lose the upload. The library can rebuild it.
    console.error("[library] preview failed:", err instanceof Error ? err.message : err);
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from("photo_inventory").update(patch).eq("id", data.id);
  }
  return { alreadyExists: false, photo: { ...data, ...patch }, visionImages };
}

/**
 * Tag one library item. Images already in memory are used when given;
 * otherwise a photo's original is downloaded, or a video's poster is used.
 * A failure is recorded on the row (auto_tag_error) so it can be retried,
 * and never loses the item.
 */
export async function autoTagItem(
  supabase: SupabaseAdmin,
  itemId: string,
  options: { visionImages?: VisionImage[]; deps?: LibraryDeps } = {}
): Promise<{ ok: boolean; error?: string }> {
  const deps = options.deps ?? realDeps(supabase);
  const { data: item } = await supabase
    .from("photo_inventory")
    .select("id, company_id, kind, bucket, storage_path, poster_path, tags, scene_label")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Not found" };

  try {
    let images = options.visionImages ?? [];
    if (images.length === 0) {
      if (item.kind === "photo" && item.storage_path) {
        const d = await makeImageDerivatives(await deps.download(CAPTURES_BUCKET, item.storage_path));
        images = [{ mimeType: "image/jpeg", base64: d.vision.toString("base64") }];
      } else if (item.kind === "video" && item.poster_path) {
        const poster = await deps.download(CAPTURES_BUCKET, item.poster_path);
        images = [{ mimeType: "image/jpeg", base64: poster.toString("base64") }];
      } else {
        throw new Error("Nothing to look at: no preview was made for this file");
      }
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name, industry, description")
      .eq("id", item.company_id)
      .maybeSingle();
    const venueContext = company
      ? [company.name, company.industry, company.description].filter(Boolean).join(". ").slice(0, 300)
      : null;

    // One call. For a video the several frames go in together.
    const result = await deps.tag(images, { venueContext });
    const merged = unionFrameTags([result]);

    await supabase
      .from("photo_inventory")
      .update({
        tags: mergeAutoTags((item.tags as string[]) || [], merged.tags),
        people_present: merged.people_present,
        text_space: merged.text_space,
        ...(item.scene_label ? {} : { scene_label: merged.scene_label }),
        auto_tagged_at: new Date().toISOString(),
        auto_tag_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tagging failed";
    await supabase
      .from("photo_inventory")
      .update({ auto_tag_error: message.slice(0, 300), updated_at: new Date().toISOString() })
      .eq("id", item.id);
    return { ok: false, error: message };
  }
}

/**
 * Rebuild a photo's thumbnail when it is missing (for example the preview
 * step failed at upload time). Returns the new thumbnail path, or null.
 */
export async function rebuildPreview(
  supabase: SupabaseAdmin,
  itemId: string,
  deps: LibraryDeps = realDeps(supabase)
): Promise<string | null> {
  const { data: item } = await supabase
    .from("photo_inventory")
    .select("id, company_id, kind, storage_path, thumb_path, width, height")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.kind !== "photo" || item.thumb_path || !item.storage_path) return null;
  try {
    const d = await makeImageDerivatives(await deps.download(CAPTURES_BUCKET, item.storage_path));
    const thumbPath = derivedPath(item.company_id, "thumbs", item.storage_path);
    await deps.upload(CAPTURES_BUCKET, thumbPath, d.thumb, "image/jpeg");
    await supabase
      .from("photo_inventory")
      .update({ thumb_path: thumbPath, ...(item.width && item.height ? {} : { width: d.width, height: d.height }) })
      .eq("id", item.id);
    return thumbPath;
  } catch (err) {
    console.error("[library] rebuild preview failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
