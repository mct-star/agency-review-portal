import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/company/regulatory-approve
 *
 * Marks a content piece as compliance-approved.
 *
 * Body: { pieceId: string }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pieceId } = body;

  if (!pieceId) {
    return NextResponse.json({ error: "pieceId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("content_pieces")
    .update({ regulatory_status: "approved" })
    .eq("id", pieceId);

  if (error) {
    console.error("[regulatory-approve] Update error:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
