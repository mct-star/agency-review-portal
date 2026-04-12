import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/content/approve
 *
 * Update the approval_status of a single content piece.
 *
 * Body: {
 *   pieceId: string,
 *   status: "approved" | "changes_requested",
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pieceId, status } = body;

  if (!pieceId || !status) {
    return NextResponse.json(
      { error: "pieceId and status are required" },
      { status: 400 }
    );
  }

  if (!["approved", "changes_requested"].includes(status)) {
    return NextResponse.json(
      { error: "status must be 'approved' or 'changes_requested'" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("content_pieces")
    .update({
      approval_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId)
    .select("id, approval_status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ piece: data });
}
