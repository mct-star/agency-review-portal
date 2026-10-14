import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

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
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
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

  // Load the piece first: a member may only decide on their own company's
  // pieces; an admin passes for any company.
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("company_id")
    .eq("id", pieceId)
    .single();
  const user = piece ? await requireCompanyUser(piece.company_id) : null;
  if (!piece || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("content_pieces")
    .update({
      approval_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId)
    .eq("company_id", piece.company_id)
    .select("id, approval_status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ piece: data });
}
