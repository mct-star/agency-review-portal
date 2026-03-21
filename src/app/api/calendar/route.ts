import { NextResponse } from "next/server";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

/**
 * GET /api/calendar?companyId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns weeks and content pieces within the date range for the calendar view.
 * Weeks are matched by their date_start/date_end overlapping the requested range.
 */
export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Non-admin users can only see their own company
  if (profile.role !== "admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();

  try {
    // Fetch weeks that overlap with the date range
    let weeksQuery = supabase
      .from("weeks")
      .select("id, week_number, year, date_start, date_end, title, pillar, theme, status")
      .eq("company_id", companyId)
      .order("date_start", { ascending: true });

    if (start) weeksQuery = weeksQuery.gte("date_end", start);
    if (end) weeksQuery = weeksQuery.lte("date_start", end);

    const { data: weeks, error: weeksErr } = await weeksQuery;
    if (weeksErr) throw weeksErr;

    // Fetch content pieces for those weeks
    const weekIds = (weeks || []).map((w) => w.id);
    let pieces: Array<{
      id: string;
      title: string;
      content_type: string;
      day_of_week: string | null;
      scheduled_time: string | null;
      post_type: string | null;
      approval_status: string;
      image_generation_status: string;
      week_id: string;
      markdown_body: string;
    }> = [];

    if (weekIds.length > 0) {
      const { data: piecesData, error: piecesErr } = await supabase
        .from("content_pieces")
        .select(
          "id, title, content_type, day_of_week, scheduled_time, post_type, approval_status, image_generation_status, week_id, markdown_body"
        )
        .in("week_id", weekIds)
        .order("sort_order", { ascending: true });

      if (piecesErr) throw piecesErr;
      pieces = piecesData || [];
    }

    // Also fetch the posting schedule template (slots define what should exist each week)
    const { data: slots } = await supabase
      .from("posting_slots")
      .select("id, day_of_week, scheduled_time, slot_label, image_archetype, post_type_id, post_types(slug, label, content_type)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("day_of_week")
      .order("scheduled_time");

    return NextResponse.json({ weeks: weeks || [], pieces, slots: slots || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load calendar" },
      { status: 500 }
    );
  }
}
