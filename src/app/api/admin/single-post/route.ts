import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import { londonToday } from "@/lib/single-post/today";

/**
 * Single post: one MCT post for one calendar slot.
 *
 * POST /api/admin/single-post  { slotId?: string }
 *   Queues a `single_post` job. Without slotId it uses today's slot
 *   (Europe/London). The Mac job bridge poller (SinglePostHandler) writes
 *   the post with the weekly pipeline's Step 2 chain into
 *   Weekly_Outputs/Week_N/OUTPUT_WeekN_Post_<date>.md. One live job per
 *   slot, enforced by content_generation_jobs_single_post_active_uniq.
 *
 * GET /api/admin/single-post?slotIds=a,b
 *   Latest single_post job per slot, for the buttons' status line.
 */

const SLOT_COLUMNS =
  "id, company_id, week_number, year, slot_date, day_of_week, slot_type, slot_role, post_type_slug, topic, pillar, theme, source_owner";

export async function POST(request: Request) {
  if (!isWeekBoardEnabled()) {
    return NextResponse.json({ error: "Week Board is not enabled" }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const slotId = typeof body?.slotId === "string" ? body.slotId : null;
  const supabase = await createAdminSupabaseClient();

  let query = supabase.from("calendar_slots").select(SLOT_COLUMNS);
  query = slotId ? query.eq("id", slotId) : query.eq("slot_date", londonToday());
  const { data: slots, error: slotErr } = await query;
  if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 });
  if (!slots || slots.length === 0) {
    return NextResponse.json(
      { error: slotId ? "That calendar slot was not found." : "There is no post in the calendar for today.", code: "NO_SLOT" },
      { status: 404 }
    );
  }
  if (slots.length > 1) {
    return NextResponse.json(
      { error: "The calendar has more than one post today. Use the button on the slot in the Source Calendar.", code: "AMBIGUOUS" },
      { status: 409 }
    );
  }
  const slot = slots[0];
  if (slot.day_of_week === "sunday" && slot.slot_type !== "video" && slot.slot_type !== "meme") {
    return NextResponse.json({ error: "There is no Sunday post in the MCT feed." }, { status: 400 });
  }

  // A video slot is produced on the Mac by the video_post handler, routed by
  // its post type; everything else (including the meme) is a single_post.
  const isVideo = slot.slot_type === "video";
  if (isVideo && !slot.post_type_slug) {
    return NextResponse.json({ error: "This video slot has no post type. Set post_type_slug on the calendar slot first." }, { status: 400 });
  }
  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert(isVideo ? {
      job_type: "video_post",
      status: "queued",
      company_id: slot.company_id,
      week_id: null,
      triggered_by: admin.id,
      run_id: crypto.randomUUID(),
      input_payload: {
        post_type_slug: slot.post_type_slug,
        post_date: slot.slot_date,
        slot_id: slot.id,
        topic: slot.topic, notes: slot.slot_role, pillar: slot.pillar,
      },
    } : {
      job_type: "single_post",
      status: "queued",
      company_id: slot.company_id,
      week_id: null,
      triggered_by: admin.id,
      run_id: crypto.randomUUID(),
      input_payload: {
        week: slot.week_number,
        year: slot.year,
        post_date: slot.slot_date,
        slot_id: slot.id,
        slot: {
          topic: slot.topic, slot_role: slot.slot_role, slot_type: slot.slot_type,
          pillar: slot.pillar, theme: slot.theme, source_owner: slot.source_owner,
          post_type_slug: slot.post_type_slug,
        },
      },
    })
    .select("id, status, created_at, input_payload")
    .single();

  if (jobErr || !job) {
    if (jobErr?.code === "23505") {
      return NextResponse.json(
        { error: "This post is already being written.", code: "ALREADY_RUNNING" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: jobErr?.message || "Failed to queue the post" }, { status: 500 });
  }
  return NextResponse.json({ data: { job, slot } });
}

export async function GET(request: Request) {
  if (!isWeekBoardEnabled()) {
    return NextResponse.json({ error: "Week Board is not enabled" }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const slotIds = (url.searchParams.get("slotIds") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const supabase = await createAdminSupabaseClient();
  let query = supabase
    .from("content_generation_jobs")
    .select("id, status, error_message, output_payload, input_payload, created_at, completed_at")
    .in("job_type", ["single_post", "video_post"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (slotIds.length) query = query.in("input_payload->>slot_id", slotIds);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latest: Record<string, unknown> = {};
  for (const row of data || []) {
    const id = (row.input_payload as { slot_id?: string } | null)?.slot_id;
    if (id && !latest[id]) latest[id] = row;
  }
  return NextResponse.json({ data: latest, today: londonToday() });
}
