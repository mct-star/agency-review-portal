import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authorisePiece } from "@/lib/hospitality/access";
import { APPROVABLE_COLUMNS, recordDecisions, type ApprovablePiece } from "@/lib/content/version-hash";

/**
 * POST /api/hospitality/pieces/[id]/decision  { decision: "approve" | "discard" | "unapprove" }
 *
 * The one tap on a draft. Approve makes it eligible for export. Discard
 * deletes a draft that was never approved. Unapprove puts an approved post
 * back to a draft so it can be edited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorisePiece(id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));
  const supabase = await createAdminSupabaseClient();

  if (body.decision === "approve") {
    // Record first: an approved status never exists without its record.
    const { data: full } = await supabase
      .from("content_pieces")
      .select(APPROVABLE_COLUMNS)
      .eq("id", id)
      .single<ApprovablePiece>();
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const recordError = await recordDecisions(supabase, [full], "approved", String(access.profile.id), "review");
    if (recordError) {
      return NextResponse.json({ error: `The approval could not be recorded, so nothing changed: ${recordError}` }, { status: 500 });
    }
    const { error } = await supabase.from("content_pieces").update({ approval_status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "approved" });
  }
  if (body.decision === "unapprove") {
    const { error } = await supabase.from("content_pieces").update({ approval_status: "pending", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "pending" });
  }
  if (body.decision === "discard") {
    if (access.piece.approval_status === "approved") {
      return NextResponse.json({ error: "This post is approved. Change it back to a draft first." }, { status: 409 });
    }
    const { error } = await supabase.from("content_pieces").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "discarded" });
  }
  return NextResponse.json({ error: 'decision must be "approve", "discard" or "unapprove"' }, { status: 400 });
}
