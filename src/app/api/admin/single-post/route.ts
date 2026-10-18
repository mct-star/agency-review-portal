import { after, NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import { londonToday } from "@/lib/single-post/today";
import { queueApiProductionJob, ApiProductionQueueError } from "@/lib/api-production/queue";
import { runApiProductionJob } from "@/lib/api-production/runner";

export const maxDuration = 300;

/** Authenticated Week Board and Quick Generate entry point for hosted API authoring.
 * Existing local jobs remain readable, but new writing uses the API executor.
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

  // Quick Generate can queue a card or video script without a calendar slot.
  if (!slotId && typeof body?.postTypeSlug === "string") {
    return queueDirect(supabase, admin.id, body);
  }

  let query = supabase.from("calendar_slots").select(SLOT_COLUMNS);
  query = slotId ? query.eq("id", slotId) : query.eq("slot_date", londonToday());
  const { data: slots, error: slotErr } = await query;
  if (slotErr) return NextResponse.json({ error: "Could not read the calendar." }, { status: 500 });
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

  return enqueue(supabase, admin.id, slot.company_id, { kind: "slot", slot_id: slot.id }, slot);
}

export async function GET(request: Request) {
  if (!isWeekBoardEnabled()) {
    return NextResponse.json({ error: "Week Board is not enabled" }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (jobId) return jobWithPiece(jobId);
  const slotIds = (url.searchParams.get("slotIds") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const supabase = await createAdminSupabaseClient();
  let query = supabase
    .from("content_generation_jobs")
    .select("id, status, error_message, output_payload, input_payload, created_at, completed_at")
    .or("job_type.in.(single_post,video_post),and(job_type.eq.content_generation,provider.eq.api_engine)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (slotIds.length) query = query.in("input_payload->>slot_id", slotIds);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not read production status." }, { status: 500 });

  const latest: Record<string, unknown> = {};
  for (const row of data || []) {
    const id = (row.input_payload as { slot_id?: string } | null)?.slot_id;
    if (id && !latest[id]) latest[id] = row;
  }
  return NextResponse.json({ data: latest, today: londonToday() });
}

const DIRECT_TYPES = new Set(["story_video", "reaction_ranking", "meme", "mini_infographic"]);

async function enqueue(
  db: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  actorId: string,
  companyId: string,
  input: Parameters<typeof queueApiProductionJob>[1]["input"],
  slot?: unknown,
) {
  try {
    const job = await queueApiProductionJob(db, { companyId, actorId, input, retryFailed: true });
    if (job.status === "queued") after(() => runApiProductionJob(job.id, companyId));
    return NextResponse.json({ data: { job, ...(slot ? { slot } : {}) } });
  } catch (error) {
    if (error instanceof ApiProductionQueueError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Could not queue the post. Please retry." }, { status: 500 });
  }
}

async function queueDirect(
  db: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  actorId: string,
  body: { postTypeSlug: string; topic?: unknown; postDate?: unknown; companyId?: unknown; pillar?: unknown },
) {
  if (!DIRECT_TYPES.has(body.postTypeSlug)) return NextResponse.json({ error: "Choose a card or a script format. Clips need source footage." }, { status: 400 });
  if (typeof body.companyId !== "string" || !body.companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  if (typeof body.topic !== "string" || !body.topic.trim()) return NextResponse.json({ error: "Add a topic first." }, { status: 400 });
  const { data: company, error } = await db.from("companies").select("id").eq("id", body.companyId).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check this company." }, { status: 500 });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return enqueue(db, actorId, body.companyId, { kind: "direct", direct: {
    post_type_slug: body.postTypeSlug,
    topic: body.topic.trim().slice(0, 500),
    post_date: typeof body.postDate === "string" ? body.postDate : londonToday(),
    pillar: typeof body.pillar === "string" ? body.pillar.slice(0, 200) : null,
  } });
}

async function jobWithPiece(jobId: string) {
  const supabase = await createAdminSupabaseClient();
  const { data: job, error } = await supabase
    .from("content_generation_jobs")
    .select("id, company_id, status, error_message, output_payload, content_piece_id")
    .eq("id", jobId)
    .or("job_type.in.(single_post,video_post),and(job_type.eq.content_generation,provider.eq.api_engine)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read production status." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const out = (job.output_payload || {}) as { content_piece_id?: string; image_url?: string };
  const pieceId = job.content_piece_id || out.content_piece_id || null;
  let piece = null;
  if (job.status === "completed" && pieceId) {
    const { data } = await supabase
      .from("content_pieces")
      .select("id, markdown_body, first_comment, cover_image_url, post_type")
      .eq("id", pieceId)
      .eq("company_id", job.company_id)
      .maybeSingle();
    piece = data ? { ...data, cover_image_url: data.cover_image_url || out.image_url || null } : null;
  }
  return NextResponse.json({ data: { id: job.id, status: job.status, error: job.error_message, piece } });
}
