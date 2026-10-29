import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { processLinkedInDirectJob } from "@/lib/linkedin/direct-worker";

export const maxDuration = 300;

/** Dispatch due, explicitly tagged LinkedIn jobs; legacy Mac queue jobs are excluded. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: running } = await supabase.from("publishing_jobs").select("id, company_id, response_payload")
    .eq("target_platform", "linkedin_personal").contains("publish_payload", { provider: "linkedin-direct-v1" })
    .eq("status", "running").limit(50);
  const stale = (running || []).filter((job) => {
    const startedAt = Date.parse((job.response_payload as { attempt_started_at?: string } | null)?.attempt_started_at || "");
    return Number.isFinite(startedAt) && startedAt < Date.parse(staleBefore);
  });
  let staleMarked = 0;
  for (const job of stale) {
    const { data: updated } = await supabase.from("publishing_jobs").update({
      status: "failed",
      error_message: "The publishing worker stopped before confirming the result. Check LinkedIn before taking any further action.",
      response_payload: { outcome_uncertain: true, manual_check_required: true },
    }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running").select("id");
    staleMarked += updated?.length || 0;
  }
  const { data: candidates, error } = await supabase.from("publishing_jobs")
    .select("id, company_id, content_piece_id, social_account_id, status, scheduled_for, publish_payload")
    .eq("target_platform", "linkedin_personal")
    .contains("publish_payload", { provider: "linkedin-direct-v1" })
    .in("status", ["queued", "scheduled"])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("scheduled_for", { ascending: true, nullsFirst: true })
    // One upload can use most of this invocation's bounded runtime. Leave
    // other jobs queued for the next minute instead of starting work that
    // could be interrupted by the function's time limit.
    .limit(1);
  if (error) return NextResponse.json({ error: "Could not read the LinkedIn queue." }, { status: 500 });

  const totals = { published: 0, failed: 0, uncertain: staleMarked, claimed: 0 };
  for (const candidate of candidates || []) {
    // Conditional update is the claim lock. A concurrent worker will receive
    // no row after the first process changes queued/scheduled to running.
    const { data: claimed } = await supabase.from("publishing_jobs").update({ status: "running", response_payload: { attempt_started_at: new Date().toISOString() } })
      .eq("id", candidate.id).eq("company_id", candidate.company_id)
      .eq("target_platform", "linkedin_personal")
      .contains("publish_payload", { provider: "linkedin-direct-v1" })
      .in("status", ["queued", "scheduled"])
      .select("id, company_id, content_piece_id, social_account_id, triggered_by, publish_payload").maybeSingle();
    if (!claimed) continue;
    totals.claimed++;
    totals[await processLinkedInDirectJob(supabase, claimed)]++;
  }
  return NextResponse.json({ ok: true, ...totals });
}
