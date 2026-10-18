import { after, NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import { queueApiProductionJob, ApiProductionQueueError } from "@/lib/api-production/queue";
import { runApiProductionJob } from "@/lib/api-production/runner";

export const maxDuration = 300;

const VALID_MODES = new Set(["fresh", "resume"]);

/** Queues hosted API production from the Week Board, preserving the existing job and week status records. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ weekId: string }> }
) {
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

  const { weekId } = await params;
  const body = await request.json().catch(() => ({}));
  const mode = body?.mode;

  if (!VALID_MODES.has(mode)) {
    return NextResponse.json(
      { error: 'mode must be "fresh" or "resume"' },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const { data: weekRow, error: weekErr } = await supabase
    .from("weeks")
    .select("*")
    .eq("id", weekId)
    .single();

  if (weekErr || !weekRow) {
    return NextResponse.json({ error: "Week not found" }, { status: 404 });
  }

  try {
    const job = await queueApiProductionJob(supabase, {
      companyId: weekRow.company_id, actorId: admin.id, retryFailed: true,
      weekId: weekRow.id, input: { kind: "week", week_id: weekRow.id, mode },
    });
    if (job.status === "queued") after(() => runApiProductionJob(job.id, weekRow.company_id));
    const { data: updatedWeek } = await supabase.from("weeks").select("*").eq("id", weekRow.id).eq("company_id", weekRow.company_id).single();
    return NextResponse.json({ data: { job, week: updatedWeek || weekRow } });
  } catch (error) {
    if (error instanceof ApiProductionQueueError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Could not queue API production. Please retry." }, { status: 500 });
  }
}
