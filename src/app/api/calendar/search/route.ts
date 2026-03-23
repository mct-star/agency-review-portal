import { NextResponse } from "next/server";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

/**
 * GET /api/calendar/search?companyId=...&q=...&mode=search|recent
 *
 * Search mode: full-text search across title and markdown_body.
 * Recent mode: returns the most recent posts ordered by created_at desc.
 *
 * Both return content pieces with their parent week data.
 */
export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const query = searchParams.get("q") || "";
  const mode = searchParams.get("mode") || "search";
  const status = searchParams.get("status"); // optional: pending, approved, changes_requested

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  if (profile.role !== "admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();

  try {
    // First get all week IDs for this company
    const { data: companyWeeks } = await supabase
      .from("weeks")
      .select("id, week_number, year, date_start, date_end, title, pillar, theme, status")
      .eq("company_id", companyId)
      .order("date_start", { ascending: false });

    const weekIds = (companyWeeks || []).map((w) => w.id);
    if (weekIds.length === 0) {
      return NextResponse.json({ pieces: [], weeks: [] });
    }

    let piecesQuery = supabase
      .from("content_pieces")
      .select(
        "id, title, content_type, day_of_week, scheduled_time, post_type, approval_status, image_generation_status, week_id, markdown_body, created_at"
      )
      .in("week_id", weekIds);

    if (mode === "search" && query.trim()) {
      // Search in title and markdown_body using ilike
      piecesQuery = piecesQuery.or(
        `title.ilike.%${query.trim()}%,markdown_body.ilike.%${query.trim()}%`
      );
    }

    if (status) {
      piecesQuery = piecesQuery.eq("approval_status", status);
    }

    if (mode === "recent") {
      piecesQuery = piecesQuery.order("created_at", { ascending: false }).limit(20);
    } else {
      piecesQuery = piecesQuery.order("created_at", { ascending: false }).limit(50);
    }

    const { data: pieces, error: piecesErr } = await piecesQuery;
    if (piecesErr) throw piecesErr;

    // Return only the weeks referenced by results
    const usedWeekIds = new Set((pieces || []).map((p) => p.week_id));
    const relevantWeeks = (companyWeeks || []).filter((w) => usedWeekIds.has(w.id));

    return NextResponse.json({ pieces: pieces || [], weeks: relevantWeeks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
