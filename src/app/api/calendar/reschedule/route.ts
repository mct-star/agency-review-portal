import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/calendar/reschedule
 *
 * Moves a content piece to a different day within the same week.
 * Used by the calendar drag-and-drop feature.
 */
export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pieceId, newDayOfWeek } = body;

  if (!pieceId || !newDayOfWeek) {
    return NextResponse.json(
      { error: "pieceId and newDayOfWeek required" },
      { status: 400 }
    );
  }

  const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (!validDays.includes(newDayOfWeek)) {
    return NextResponse.json(
      { error: `Invalid day: ${newDayOfWeek}. Must be one of: ${validDays.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Verify the piece exists and the user has access
  const { data: piece, error: pieceErr } = await supabase
    .from("content_pieces")
    .select("id, company_id, week_id, day_of_week")
    .eq("id", pieceId)
    .single();

  if (pieceErr || !piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // Non-admin users can only move their own company's pieces
  if (profile.role !== "admin" && profile.company_id !== piece.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update the day
  const { error: updateErr } = await supabase
    .from("content_pieces")
    .update({ day_of_week: newDayOfWeek })
    .eq("id", pieceId);

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    pieceId,
    previousDay: piece.day_of_week,
    newDay: newDayOfWeek,
  });
}
