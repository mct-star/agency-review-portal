import { NextResponse } from "next/server";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

/**
 * GET /api/calendar?companyId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns weeks and content pieces within the date range for the calendar view.
 * Weeks are matched by their date_start/date_end overlapping the requested range.
 * `unscheduled` is the tray: posts in the standalone week or with no day.
 */
const PIECE_COLUMNS =
  "id, title, content_type, day_of_week, scheduled_time, scheduled_date, post_type, approval_status, image_generation_status, week_id, markdown_body, cover_image_url, first_comment";

interface CalendarPieceRow {
  id: string;
  title: string;
  content_type: string;
  day_of_week: string | null;
  scheduled_time: string | null;
  scheduled_date: string | null;
  post_type: string | null;
  approval_status: string;
  image_generation_status: string;
  week_id: string;
  markdown_body: string;
  cover_image_url: string | null;
  first_comment: string | null;
}

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

    // Fetch content pieces for those weeks (including cover image URL for thumbnails)
    const weekIds = (weeks || []).filter((w) => w.week_number > 0).map((w) => w.id);
    let pieces: CalendarPieceRow[] = [];
    if (weekIds.length > 0) {
      const { data: piecesData, error: piecesErr } = await supabase
        .from("content_pieces").select(PIECE_COLUMNS)
        .in("week_id", weekIds).not("day_of_week", "is", null)
        .order("sort_order", { ascending: true });
      if (piecesErr) throw piecesErr;
      pieces = (piecesData || []) as CalendarPieceRow[];
    }

    // The Unscheduled tray: the standalone week, and any post with no day.
    const { data: standalone } = await supabase.from("weeks").select("id")
      .eq("company_id", companyId).eq("week_number", 0);
    const standaloneIds = (standalone || []).map((w) => w.id);
    const trayFilter = standaloneIds.length
      ? `day_of_week.is.null,week_id.in.(${standaloneIds.join(",")})`
      : "day_of_week.is.null";
    const { data: trayData, error: trayErr } = await supabase
      .from("content_pieces").select(PIECE_COLUMNS)
      .eq("company_id", companyId).or(trayFilter)
      .order("created_at", { ascending: false }).limit(60);
    if (trayErr) throw trayErr;
    const unscheduled = (trayData || []) as CalendarPieceRow[];

    // If cover_image_url is null, use the piece's first content_image.
    const needImages = [...pieces, ...unscheduled].filter((p) => !p.cover_image_url);
    if (needImages.length > 0) {
      const { data: images } = await supabase
        .from("content_images").select("content_piece_id, public_url")
        .in("content_piece_id", needImages.map((p) => p.id))
        .order("sort_order", { ascending: true });
      const imageMap = new Map<string, string>();
      for (const img of images || []) {
        if (!imageMap.has(img.content_piece_id)) imageMap.set(img.content_piece_id, img.public_url);
      }
      for (const p of needImages) p.cover_image_url = imageMap.get(p.id) || null;
    }

    // Also fetch the posting schedule template (slots define what should exist each week)
    const { data: slots } = await supabase
      .from("posting_slots")
      .select("id, day_of_week, scheduled_time, slot_label, image_archetype, post_type_id, post_types(slug, label, content_type)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("day_of_week")
      .order("scheduled_time");

    return NextResponse.json({ weeks: weeks || [], pieces, unscheduled, slots: slots || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load calendar" },
      { status: 500 }
    );
  }
}
