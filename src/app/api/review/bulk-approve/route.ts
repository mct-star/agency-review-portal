import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/review/bulk-approve
 *
 * Approve all pending content pieces in a week at once.
 *
 * Body: {
 *   weekId: string,
 *   pieceIds?: string[],  // Optional: approve specific pieces. If omitted, approve all pending.
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { weekId, pieceIds } = body;

  if (!weekId) {
    return NextResponse.json({ error: "weekId is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Build the update query
  let query = supabase
    .from("content_pieces")
    .update({
      approval_status: "approved",
      updated_at: new Date().toISOString(),
    })
    .eq("week_id", weekId)
    .eq("approval_status", "pending");

  if (pieceIds && pieceIds.length > 0) {
    query = query.in("id", pieceIds);
  }

  const { data, error, count } = await query.select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const approvedCount = data?.length || 0;

  // Check if all pieces in the week are now approved
  const { count: totalCount } = await supabase
    .from("content_pieces")
    .select("*", { count: "exact", head: true })
    .eq("week_id", weekId);

  const { count: approvedTotal } = await supabase
    .from("content_pieces")
    .select("*", { count: "exact", head: true })
    .eq("week_id", weekId)
    .eq("approval_status", "approved");

  const allApproved = totalCount && approvedTotal && totalCount === approvedTotal;

  // Promote week status if all pieces are approved
  if (allApproved) {
    await supabase
      .from("weeks")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", weekId);
  }

  return NextResponse.json({
    approvedCount,
    totalPieces: totalCount || 0,
    allApproved: !!allApproved,
    weekStatus: allApproved ? "approved" : "ready_for_review",
  });
}
