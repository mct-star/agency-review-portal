import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET, PUBLISHED_BUCKET } from "@/lib/upload/media-constants";
import { copyToPublishedBucket, nextImageSortOrder } from "./publish-copy";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export class AttachError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Put a library photo or clip on a post. This is the one place an original
 * is touched: it is copied into the public bucket (a post needs a permanent
 * URL) and recorded against the post. Used by "Choose from library" and by
 * the automatic drafts, so both land media the same way.
 */
export async function attachLibraryItemToPiece(
  supabase: SupabaseAdmin,
  itemId: string,
  contentPieceId: string,
  options: { weekNumber?: number | null } = {}
): Promise<{ kind: "photo" | "video"; publicUrl: string }> {
  const [{ data: item }, { data: piece }] = await Promise.all([
    supabase
      .from("photo_inventory")
      .select("id, company_id, kind, bucket, storage_path, mime_type, width, height, duration_seconds, original_filename, scene_label, status, used_in_weeks")
      .eq("id", itemId)
      .maybeSingle(),
    supabase.from("content_pieces").select("id, company_id").eq("id", contentPieceId).maybeSingle(),
  ]);
  if (!item) throw new AttachError("Not in the library", 404);
  if (!piece) throw new AttachError("Content piece not found", 404);
  if (piece.company_id !== item.company_id) throw new AttachError("That post belongs to another company", 400);
  if (item.status === "pending") throw new AttachError("That photo is waiting for approval and cannot be used yet", 409);
  if (item.bucket !== CAPTURES_BUCKET || !item.storage_path) throw new AttachError("The original file is missing", 409);

  const filename = item.storage_path.slice(item.storage_path.lastIndexOf("/") + 1);
  const folder = item.kind === "video" ? "videos" : "images";
  const publishedPath = `${folder}/${item.company_id}/${contentPieceId}/${filename}`;
  try {
    await copyToPublishedBucket(supabase, item.storage_path, publishedPath, item.mime_type || "application/octet-stream");
  } catch (err) {
    throw new AttachError(err instanceof Error ? err.message : "Copy failed", 500);
  }
  const { data: urlData } = supabase.storage.from(PUBLISHED_BUCKET).getPublicUrl(publishedPath);

  if (item.kind === "video") {
    const { error } = await supabase.from("content_assets").insert({
      content_piece_id: contentPieceId,
      asset_type: "custom",
      text_content: item.scene_label || item.original_filename,
      file_url: urlData.publicUrl,
      storage_path: publishedPath,
      asset_metadata: { type: "rendered_video", source: "bank", bank_id: item.id, durationSeconds: item.duration_seconds },
    });
    if (error) throw new AttachError(`Could not attach the clip: ${error.message}`, 500);
  } else {
    const { error } = await supabase.from("content_images").insert({
      content_piece_id: contentPieceId,
      filename,
      storage_path: publishedPath,
      public_url: urlData.publicUrl,
      archetype: "bank_photo",
      dimensions: item.width && item.height ? `${item.width}x${item.height}` : null,
      sort_order: await nextImageSortOrder(supabase, contentPieceId),
    });
    if (error) throw new AttachError(`Could not attach the photo: ${error.message}`, 500);
  }

  const used: number[] = (item.used_in_weeks as number[] | null) ?? [];
  const weekNumber = options.weekNumber ?? null;
  await supabase
    .from("photo_inventory")
    .update({
      last_used_at: new Date().toISOString(),
      ...(weekNumber !== null && !used.includes(weekNumber) ? { used_in_weeks: [...used, weekNumber] } : {}),
    })
    .eq("id", item.id);

  return { kind: item.kind as "photo" | "video", publicUrl: urlData.publicUrl };
}
