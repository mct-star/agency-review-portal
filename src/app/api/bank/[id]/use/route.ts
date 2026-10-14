import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseBankItem } from "@/lib/media/access";
import { attachLibraryItemToPiece, AttachError } from "@/lib/media/attach";

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
  const { id } = await params;
  const access = await authoriseBankItem(id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));
  const contentPieceId = typeof body.contentPieceId === "string" ? body.contentPieceId : null;
  if (!contentPieceId) return NextResponse.json({ error: "contentPieceId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  try {
    const result = await attachLibraryItemToPiece(supabase, id, contentPieceId);
    return NextResponse.json({ ok: true, kind: result.kind, publicUrl: result.publicUrl });
  } catch (err) {
    if (err instanceof AttachError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not add it" }, { status: 500 });
  }
}
