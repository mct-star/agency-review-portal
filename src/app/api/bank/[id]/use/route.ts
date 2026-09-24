import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET, PUBLISHED_BUCKET } from "@/lib/upload/media-constants";
import { copyToPublishedBucket, nextImageSortOrder } from "@/lib/media/publish-copy";

/**
 * POST /api/bank/[id]/use  { contentPieceId }
 *
 * Puts a bank photo or clip on a post. The original is copied into the
 * public content-assets bucket (posts need a permanent URL); a photo joins
 * the piece's images, a clip becomes the piece's video. The preview and
 * publish both read these through resolvePieceMedia, so what shows is
 * what posts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const contentPieceId = typeof body.contentPieceId === "string" ? body.contentPieceId : null;
  if (!contentPieceId) return NextResponse.json({ error: "contentPieceId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const [{ data: item }, { data: piece }] = await Promise.all([
    supabase.from("photo_inventory").select("id, company_id, kind, bucket, storage_path, mime_type, width, height, duration_seconds, original_filename, scene_label").eq("id", id).maybeSingle(),
    supabase.from("content_pieces").select("id, company_id").eq("id", contentPieceId).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ error: "Not in the bank" }, { status: 404 });
  if (!piece) return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  if (piece.company_id !== item.company_id) return NextResponse.json({ error: "That post belongs to another company" }, { status: 400 });
  if (item.bucket !== CAPTURES_BUCKET || !item.storage_path) return NextResponse.json({ error: "The original file is missing" }, { status: 409 });

  const filename = item.storage_path.slice(item.storage_path.lastIndexOf("/") + 1);
  const folder = item.kind === "video" ? "videos" : "images";
  const publishedPath = `${folder}/${item.company_id}/${contentPieceId}/${filename}`;
  try {
    await copyToPublishedBucket(supabase, item.storage_path, publishedPath, item.mime_type || "application/octet-stream");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Copy failed" }, { status: 500 });
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
    if (error) return NextResponse.json({ error: `Could not attach the clip: ${error.message}` }, { status: 500 });
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
    if (error) return NextResponse.json({ error: `Could not attach the photo: ${error.message}` }, { status: 500 });
  }

  await supabase.from("photo_inventory").update({ last_used_at: new Date().toISOString() }).eq("id", item.id);
  return NextResponse.json({ ok: true, kind: item.kind, publicUrl: urlData.publicUrl });
}
