import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { APPROVABLE_COLUMNS, recordDecisions, type ApprovablePiece } from "@/lib/content/version-hash";

/**
 * POST /api/review/bulk-approve
 *
 * Approve all pending content pieces in a week at once, for an admin or a
 * member of the week's company (the same people who can approve one piece). Each piece's
 * approval is recorded in content_approvals (version hash, who, when)
 * before its status changes (4 Nov 2026).
 *
 * Body: {
 *   weekId: string,
 *   pieceIds?: string[],  // Optional: approve specific pieces. If omitted, approve all pending.
 * }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { weekId, pieceIds } = body;

  if (!weekId) {
    return NextResponse.json({ error: "weekId is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // The same gate as approving one piece: an admin, or a member of the
  // week's own company. Another company's week answers the same as a
  // missing one.
  const { data: week } = await supabase
    .from("weeks")
    .select("id, company_id")
    .eq("id", weekId)
    .single<{ id: string; company_id: string }>();
  const admin = week ? await requireCompanyUser(week.company_id) : null;
  if (!week || !admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The pending pieces this approval covers, read with what their version
  // hash needs.
  let pendingQuery = supabase
    .from("content_pieces")
    .select(APPROVABLE_COLUMNS)
    .eq("week_id", weekId)
    .eq("company_id", week.company_id)
    .eq("approval_status", "pending");
  if (Array.isArray(pieceIds) && pieceIds.length > 0) {
    pendingQuery = pendingQuery.in("id", pieceIds);
  }
  const { data: pending, error: readError } = await pendingQuery.returns<ApprovablePiece[]>();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  const covered = pending || [];

  // Record first: an approved status never exists without its record.
  const recordError = await recordDecisions(supabase, covered, "approved", String(admin.id), "bulk_review");
  if (recordError) {
    return NextResponse.json(
      { error: `The approvals could not be recorded, so nothing changed: ${recordError}` },
      { status: 500 }
    );
  }

  const { data, error } = covered.length
    ? await supabase
        .from("content_pieces")
        .update({ approval_status: "approved", updated_at: new Date().toISOString() })
        .in("id", covered.map((p) => p.id))
        .eq("company_id", week.company_id)
        .eq("approval_status", "pending")
        .select("id")
    : { data: [], error: null };

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
