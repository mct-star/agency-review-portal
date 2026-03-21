import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/content/[pieceId]
 * Remove a content piece and its associated images/assets.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ pieceId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pieceId } = await params;
  if (!pieceId) {
    return NextResponse.json({ error: "pieceId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Delete in order: assets → images → comments → platform variants → piece
  // Foreign key cascades handle most of this, but let's be explicit
  await supabase.from("content_assets").delete().eq("content_piece_id", pieceId);
  await supabase.from("content_images").delete().eq("content_piece_id", pieceId);
  await supabase.from("platform_variants").delete().eq("content_piece_id", pieceId);
  await supabase.from("comments").delete().eq("content_piece_id", pieceId);

  const { error } = await supabase
    .from("content_pieces")
    .delete()
    .eq("id", pieceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
