import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { standaloneWeekId } from "@/lib/calendar/schedule";

/**
 * POST /api/content/pieces
 *
 * Save a generated post as a content piece assigned to a specific week.
 * Creates the week record if it doesn't exist yet.
 *
 * Body: {
 *   companyId: string,
 *   spokespersonId?: string,
 *   weekNumber?: number,   // or unscheduled: true, the planning board's tray
 *   unscheduled?: boolean,
 *   postType: string,
 *   platform: string,
 *   title: string,
 *   markdownBody: string,
 *   firstComment?: string,
 *   imageUrl?: string,
 *   carouselImageUrls?: string[],
 *   status?: string,       // default "draft"
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    companyId,
    spokespersonId,
    weekNumber,
    postType,
    platform,
    title,
    markdownBody,
    firstComment,
    imageUrl,
    carouselImageUrls,
    status = "draft",
    unscheduled = false,
  } = body;

  if (!companyId || (!weekNumber && !unscheduled) || !markdownBody) {
    return NextResponse.json(
      { error: "companyId, markdownBody, and weekNumber or unscheduled are required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const year = new Date().getFullYear();

  // Find or create the week
  let weekId: string;

  if (unscheduled) {
    try {
      weekId = await standaloneWeekId(supabase, companyId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No tray week" }, { status: 500 });
    }
  } else {
    const { data: existingWeek } = await supabase
      .from("weeks")
      .select("id")
      .eq("company_id", companyId)
      .eq("week_number", weekNumber)
      .eq("year", year)
      .limit(1)
      .single();

    if (existingWeek) {
      weekId = existingWeek.id;
    } else {
      // Create the week — calculate date range from week number
      const jan1 = new Date(year, 0, 1);
      const dayOffset = (weekNumber - 1) * 7;
      const weekStart = new Date(jan1.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      // Adjust to Monday
      const dayOfWeek = weekStart.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(weekStart.getDate() + mondayOffset);
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

      const { data: newWeek, error: weekError } = await supabase
        .from("weeks")
        .insert({
          company_id: companyId,
          week_number: weekNumber,
          year,
          date_start: weekStart.toISOString().split("T")[0],
          date_end: weekEnd.toISOString().split("T")[0],
          title: `Week ${weekNumber}`,
          status: "draft",
        })
        .select("id")
        .single();

      if (weekError || !newWeek) {
        return NextResponse.json(
          { error: `Failed to create week: ${weekError?.message}` },
          { status: 500 }
        );
      }
      weekId = newWeek.id;
    }
  }

  // Create the content piece
  const wordCount = markdownBody.split(/\s+/).length;

  const { data: piece, error: pieceError } = await supabase
    .from("content_pieces")
    .insert({
      week_id: weekId,
      company_id: companyId,
      spokesperson_id: spokespersonId || null,
      content_type: "social_post",
      title: title || `${postType} post`,
      markdown_body: markdownBody,
      first_comment: firstComment || null,
      post_type: postType || null,
      word_count: wordCount,
      approval_status: status === "approved" ? "approved" : "pending",
      cover_image_url: imageUrl || null,
    })
    .select("id")
    .single();

  if (pieceError || !piece) {
    return NextResponse.json(
      { error: `Failed to save content: ${pieceError?.message}` },
      { status: 500 }
    );
  }

  // Save images if provided
  if (imageUrl) {
    await supabase.from("content_images").insert({
      content_piece_id: piece.id,
      filename: `quick-gen-${postType}.png`,
      storage_path: imageUrl,
      public_url: imageUrl,
      archetype: postType,
      sort_order: 0,
    });
  }

  // Save carousel images
  if (carouselImageUrls && Array.isArray(carouselImageUrls)) {
    for (let i = 0; i < carouselImageUrls.length; i++) {
      await supabase.from("content_images").insert({
        content_piece_id: piece.id,
        filename: `carousel-slide-${i + 1}.png`,
        storage_path: carouselImageUrls[i],
        public_url: carouselImageUrls[i],
        archetype: "carousel",
        sort_order: i,
      });
    }
  }

  return NextResponse.json({
    id: piece.id,
    weekId,
    weekNumber: unscheduled ? null : weekNumber,
  });
}

/**
 * PATCH /api/content/pieces  { pieceId, markdownBody?, firstComment? }
 *
 * Saves Quick Generate's edits to a post that already exists (one the Mac
 * wrote) before it is sent to review.
 */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pieceId = typeof body.pieceId === "string" ? body.pieceId : "";
  if (!pieceId) return NextResponse.json({ error: "pieceId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase.from("content_pieces").select("id, company_id").eq("id", pieceId).maybeSingle();
  if (!piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  const profile = await requireCompanyUser(piece.company_id);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patch: Record<string, unknown> = {};
  if (typeof body.markdownBody === "string" && body.markdownBody.trim()) {
    patch.markdown_body = body.markdownBody;
    patch.word_count = body.markdownBody.split(/\s+/).length;
  }
  if (typeof body.firstComment === "string") patch.first_comment = body.firstComment || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ id: pieceId, updated: false });

  const { error } = await supabase.from("content_pieces").update(patch).eq("id", pieceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: pieceId, updated: true });
}
