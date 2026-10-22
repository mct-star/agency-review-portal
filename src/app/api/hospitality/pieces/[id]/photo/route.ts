import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authorisePiece } from "@/lib/hospitality/access";
import { attachLibraryItemToPiece, AttachError } from "@/lib/media/attach";

/**
 * POST /api/hospitality/pieces/[id]/photo  { itemId }
 * Swap the photo on a draft for another from the library. The previous
 * photo's record is removed from the post; the library keeps the file.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorisePiece(id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.piece.approval_status === "approved") {
    return NextResponse.json({ error: "This post is approved. Change it back to a draft to change the photo." }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.itemId !== "string") return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  // The new photo must belong to the same company and be approved.
  const { data: item } = await supabase.from("photo_inventory").select("id, company_id, status, kind").eq("id", body.itemId).maybeSingle();
  if (!item || item.company_id !== access.piece.company_id) return NextResponse.json({ error: "Not in the library" }, { status: 404 });
  if (item.kind !== "photo") return NextResponse.json({ error: "Choose a photo" }, { status: 400 });

  const { data: previous } = await supabase.from("content_images").select("id").eq("content_piece_id", id);
  try {
    const result = await attachLibraryItemToPiece(supabase, body.itemId, id);
    const oldIds = (previous || []).map((r) => r.id as string);
    if (oldIds.length > 0) await supabase.from("content_images").delete().in("id", oldIds);
    return NextResponse.json({ ok: true, publicUrl: result.publicUrl });
  } catch (err) {
    if (err instanceof AttachError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not change the photo" }, { status: 500 });
  }
}
