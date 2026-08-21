import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled, ACTIVE_RUN_STATES } from "@/lib/constants/week-board";
import type { Week } from "@/types/database";

const VALID_MODES = new Set(["fresh", "resume"]);

/**
 * POST /api/admin/weeks/[weekId]/run
 * Queue a weekly_production job for one week. This is the button
 * handler for Run, Resume, and Fresh on the Week Board.
 *
 * Body: { mode: "fresh" | "resume" }
 *
 * Single-flight is enforced by the partial unique index
 * content_generation_jobs_week_active_uniq (week_id, job_type)
 * where status in ('queued', 'running'). The run_state check
 * below is a fast path for the common case; the index is the
 * real guard for the race window between the check and the
 * insert, and a violation there is caught below and surfaced as
 * 409 rather than a generic 500.
 *
 * This is the interface contract the daemon-side consumer reads
 * against. Do not rename job_type, input_payload keys, or any
 * column written here without updating the daemon in lockstep.
 */
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

  const week = weekRow as Week;

  // Fast path only. The partial unique index below is the real guard
  // for the race between this check and the insert.
  if (ACTIVE_RUN_STATES.includes(week.run_state)) {
    return NextResponse.json(
      { error: "Already running", code: "ALREADY_RUNNING" },
      { status: 409 }
    );
  }

  // Fresh always starts at Phase A. Resume picks up from whatever
  // phase the last run's progress text last recorded, "Phase B ..."
  // means resume into B, anything else defaults to A.
  const phase: "A" | "B" =
    mode === "resume" && (week.current_phase || "").toLowerCase().includes("phase b")
      ? "B"
      : "A";

  const runId = crypto.randomUUID();

  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      job_type: "weekly_production",
      status: "queued",
      company_id: week.company_id,
      week_id: week.id,
      input_payload: { week: week.week_number, phase, mode },
      triggered_by: admin.id,
      run_id: runId,
    })
    .select()
    .single();

  if (jobErr || !job) {
    if (jobErr?.code === "23505") {
      return NextResponse.json(
        { error: "Already running", code: "ALREADY_RUNNING" },
        { status: 409 }
      );
    }
    console.error("Week Board run failed to queue job:", jobErr);
    return NextResponse.json(
      { error: jobErr?.message || "Failed to queue job" },
      { status: 500 }
    );
  }

  const { data: updatedWeek, error: updateErr } = await supabase
    .from("weeks")
    .update({
      run_state: "queued",
      current_job_id: job.id,
      last_error: null,
      current_phase: null,
      last_run_at: new Date().toISOString(),
    })
    .eq("id", week.id)
    .select()
    .single();

  if (updateErr) {
    // The job itself is queued and correct; the daemon reads jobs
    // directly, not the mirrored week columns. Surface the mismatch
    // rather than hide it so it can be reconciled by hand.
    console.error("Week Board run: job queued but week update failed:", updateErr);
    return NextResponse.json({
      data: { job, week },
      warning: `Job queued (${job.id}) but the week row failed to update: ${updateErr.message}`,
    });
  }

  return NextResponse.json({ data: { job, week: updatedWeek } });
}
