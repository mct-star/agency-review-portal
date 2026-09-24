import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET, PUBLISHED_BUCKET } from "@/lib/upload/media-constants";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

/**
 * Move a capture into the public bucket.
 *
 * `copy` takes a destinationBucket in this version of storage-js, so
 * the copy happens server-side and the bytes never travel through the
 * function. The download-and-reupload fallback exists because that
 * option is only honoured by recent storage-api builds, and a 2GB
 * round trip through a serverless function is a failure mode worth
 * naming in the response rather than hiding.
 */
export async function copyToPublishedBucket(
  supabase: SupabaseAdmin,
  fromPath: string,
  toPath: string,
  mimeType: string
): Promise<"copy" | "download_upload"> {
  const { error: copyErr } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .copy(fromPath, toPath, { destinationBucket: PUBLISHED_BUCKET });

  if (!copyErr) return "copy";

  const { data: blob, error: downloadErr } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .download(fromPath);

  if (downloadErr || !blob) {
    throw new Error(
      `Could not copy capture into ${PUBLISHED_BUCKET}: ${copyErr.message}, and the download fallback failed: ${
        downloadErr?.message ?? "no data"
      }`
    );
  }

  const { error: uploadErr } = await supabase.storage
    .from(PUBLISHED_BUCKET)
    .upload(toPath, blob, { contentType: mimeType, upsert: true });

  if (uploadErr) {
    throw new Error(`Could not upload capture into ${PUBLISHED_BUCKET}: ${uploadErr.message}`);
  }

  return "download_upload";
}

/**
 * sort_order is nullable on content_images and Postgres puts nulls
 * first on a descending sort, so nullsFirst: false is load bearing.
 * Without it a single legacy null row would hide the real maximum
 * and every uploaded photo would be inserted at 0.
 */
export async function nextImageSortOrder(
  supabase: SupabaseAdmin,
  contentPieceId: string
): Promise<number> {
  const { data } = await supabase
    .from("content_images")
    .select("sort_order")
    .eq("content_piece_id", contentPieceId)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1);

  const highest = data?.[0]?.sort_order;
  return typeof highest === "number" ? highest + 1 : 0;
}

