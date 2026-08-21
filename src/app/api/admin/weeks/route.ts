import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import { getWeekBoardData } from "@/lib/weeks/board-data";

/**
 * GET /api/admin/weeks
 * List every week for the Week Board, joined to its current
 * generation job. Admin only, behind the Week Board feature flag.
 * Used for both the first server-rendered paint and the client's
 * polling refresh, via the shared getWeekBoardData helper.
 */
export async function GET() {
  if (!isWeekBoardEnabled()) {
    return NextResponse.json(
      { error: "Week Board is not enabled" },
      { status: 404 }
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createAdminSupabaseClient();
    const { weeks, hiddenCount } = await getWeekBoardData(supabase);
    return NextResponse.json({ data: weeks, hiddenCount });
  } catch (err) {
    console.error("Week Board list failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load weeks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
