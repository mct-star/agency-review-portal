import type { createAdminSupabaseClient } from "@/lib/supabase/admin";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface RawVideoInput {
  contentPieceId: string;
  bucket: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  durationSeconds: number | null;
}

/**
 * Attach an uploaded video to a piece as raw footage. The file stays in the
 * private bucket: file_url is null precisely because there is no public URL
 * to hand out, which is how the clips board tells a raw clip from a render.
 * Shared by the signed-in upload and the phone capture link.
 */
export async function recordRawVideo(supabase: SupabaseAdmin, input: RawVideoInput) {
  return supabase
    .from("content_assets")
    .insert({
      content_piece_id: input.contentPieceId,
      asset_type: "custom",
      file_url: null,
      storage_path: input.path,
      asset_metadata: {
        type: "raw_video",
        bucket: input.bucket,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        durationSeconds: input.durationSeconds,
      },
      sort_order: 0,
    })
    .select("*")
    .single();
}
