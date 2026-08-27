import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import { getClipsBoardData } from "@/lib/clips/board-data";

/**
 * GET /api/admin/clips
 *
 * List the newest phone-clip video_script pieces for the Clips surface,
 * each joined to its newest raw upload, its newest mac_engine render
 * job, and whatever rendered_video assets that job (or an earlier one)
 * has produced. Also returns a short list of weeks to upload against.
 * Admin only, behind the Week Board feature flag, since Clips ships as
 * part of the same internal module.
 *
 * Response shape:
 *   {
 *     data: ClipCard[],   // see src/lib/clips/board-data.ts
 *     weeks: SelectableWeek[]
 *   }
 *
 * Used for both the first server-rendered paint (src/app/admin/clips/
 * page.tsx) and the client's polling refresh, via the shared
 * getClipsBoardData helper, so the two can never drift.
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
    const { clips, weeks } = await getClipsBoardData(supabase);
    return NextResponse.json({ data: clips, weeks });
  } catch (err) {
    console.error("Clips list failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load clips";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
