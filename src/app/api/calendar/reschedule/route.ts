import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { dateInWeek, dayOfDate, isIsoDate, normDay, standaloneWeekId, weekForDate } from "@/lib/calendar/schedule";

/**
 * PATCH /api/calendar/reschedule
 *
 * Places a content piece on the plan. Used by the planning board and the
 * calendar's drag and drop.
 *
 *   { pieceId, date: "YYYY-MM-DD" }  onto that day, in whichever week covers it
 *   { pieceId, date: null }          back to the Unscheduled tray
 *   { pieceId, newDayOfWeek }        another day of the piece's own week (older callers)
 *
 * Week, day and scheduled date always move together.
 */
export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pieceId = typeof body.pieceId === "string" ? body.pieceId : "";
  const hasDate = Object.prototype.hasOwnProperty.call(body, "date");
  if (!pieceId || (!hasDate && !body.newDayOfWeek)) {
    return NextResponse.json({ error: "pieceId and date (or newDayOfWeek) are required" }, { status: 400 });
  }
  if (hasDate && body.date !== null && !isIsoDate(body.date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD, or null for the Unscheduled tray" }, { status: 400 });
  }
  const newDay = hasDate ? null : normDay(body.newDayOfWeek as string);
  if (!hasDate && !newDay) {
    return NextResponse.json({ error: `Invalid day: ${body.newDayOfWeek}` }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: piece, error: pieceErr } = await supabase
    .from("content_pieces")
    .select("id, company_id, week_id, day_of_week, scheduled_date")
    .eq("id", pieceId)
    .single();
  if (pieceErr || !piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  if (profile.role !== "admin" && profile.company_id !== piece.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let patch: { week_id: string; day_of_week: string | null; scheduled_date: string | null };
  try {
    if (hasDate && body.date === null) {
      patch = { week_id: await standaloneWeekId(supabase, piece.company_id), day_of_week: null, scheduled_date: null };
    } else if (hasDate) {
      const date = body.date as string;
      const { data: weeks, error } = await supabase.from("weeks")
        .select("id, week_number, date_start, date_end")
        .eq("company_id", piece.company_id).gt("week_number", 0)
        .lte("date_start", date).gte("date_end", date);
      if (error) throw new Error(error.message);
      const week = weekForDate(weeks || [], date);
      if (!week) {
        return NextResponse.json({ error: `No content week covers ${date} yet. Set that week up in Plan first.` }, { status: 422 });
      }
      patch = { week_id: week.id, day_of_week: dayOfDate(date), scheduled_date: date };
    } else {
      const { data: week } = await supabase.from("weeks").select("date_start").eq("id", piece.week_id).maybeSingle();
      patch = { week_id: piece.week_id, day_of_week: newDay, scheduled_date: week ? dateInWeek(week.date_start, newDay) : null };
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not place the post" }, { status: 500 });
  }

  const { error: updateErr } = await supabase.from("content_pieces").update(patch).eq("id", pieceId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    pieceId,
    previous: { week_id: piece.week_id, day_of_week: piece.day_of_week, scheduled_date: piece.scheduled_date },
    ...patch,
  });
}
