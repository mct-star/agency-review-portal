/** Queue API-only authoring in the existing jobs table, separate from Mac consumers. */
import { randomUUID } from "node:crypto";
import { POST_TYPE_SLUGS } from "@/lib/constants/post-types";
import { productionId } from "./identity";
import { readDraftPlan } from "@/lib/calendar/quick-create";
import { API_PRODUCTION_JOB_TYPE, API_PRODUCTION_PROVIDER, type ApiProductionInput, type ApiProductionJob, type ProductionDb } from "./types";

export class ApiProductionQueueError extends Error {
  constructor(message: string, public status = 409, public code = "ALREADY_RUNNING") {
    super(message);
    this.name = "ApiProductionQueueError";
  }
}

interface QueueArgs {
  companyId: string;
  actorId: string | null;
  weekId?: string;
  input: ApiProductionInput;
  /** Only an authenticated human retry may reset an exhausted job or its failed week children. */
  retryFailed?: boolean;
}

async function resetFailedWeekChildren(db: ProductionDb, companyId: string, actorId: string | null, week: { id: string; date_start?: string; date_end?: string }): Promise<void> {
  if (!week.date_start || !week.date_end) return;
  const { data: slots, error: slotsError } = await db.from("calendar_slots").select("id")
    .eq("company_id", companyId).gte("slot_date", week.date_start).lte("slot_date", week.date_end);
  if (slotsError) throw new ApiProductionQueueError("Could not check failed week posts. Please retry.", 500, "QUEUE_FAILED");
  for (const slot of slots || []) {
    const id = apiProductionJobId(companyId, { kind: "slot", slot_id: slot.id });
    const { error } = await db.from("content_generation_jobs").update({
      status: "queued", attempt: 0, error_message: null, completed_at: null,
      worker_id: null, lease_expires_at: null, heartbeat_at: null,
      triggered_by: actorId, run_id: randomUUID(),
    }).eq("id", id).eq("company_id", companyId).eq("provider", API_PRODUCTION_PROVIDER)
      .eq("job_type", API_PRODUCTION_JOB_TYPE).eq("status", "failed");
    if (error) throw new ApiProductionQueueError("Could not reset a failed week post. Please retry.", 500, "QUEUE_FAILED");
  }
}

/** The same direct brief returns its saved result; slots and weeks have stable queue identities. */
export function apiProductionJobId(companyId: string, input: ApiProductionInput): string {
  const target = input.kind === "week" ? input.week_id : input.kind === "slot" ? input.slot_id : JSON.stringify({
    post_type_slug: input.direct?.post_type_slug,
    topic: input.direct?.topic,
    post_date: input.direct?.post_date,
    pillar: input.direct?.pillar || null,
    notes: input.direct?.notes || null,
    ...(input.direct?.post_time ? { post_time: input.direct.post_time } : {}),
  });
  return productionId(API_PRODUCTION_PROVIDER, companyId, input.kind, target || "");
}

/** Called only after an authenticated route has authorised access to companyId. */
export async function queueApiProductionJob(db: ProductionDb, args: QueueArgs): Promise<ApiProductionJob> {
  const { companyId, actorId } = args;
  const input = { ...args.input };
  if (input.kind === "week") input.week_id = args.weekId || input.week_id;
  const date = input.kind === "direct" ? input.direct?.post_date : undefined;
  const parsedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
  const validDate = !!parsedDate && !Number.isNaN(parsedDate.valueOf()) && parsedDate.toISOString().slice(0, 10) === date;
  const validTime = input.kind !== "direct" || !readDraftPlan(date, input.direct?.post_time).error;
  if (!companyId || !["week", "slot", "direct"].includes(input.kind)
    || input.kind === "week" && !input.week_id
    || input.kind === "slot" && !input.slot_id
    || input.kind === "direct" && (!input.direct?.topic?.trim() || !input.direct.post_type_slug || !POST_TYPE_SLUGS.includes(input.direct.post_type_slug) || !validDate || !validTime)) {
    throw new ApiProductionQueueError("The production request is incomplete.", 400, "INVALID_INPUT");
  }

  let week: { id: string; current_job_id: string | null; run_state: string; date_start?: string; date_end?: string } | null = null;
  if (input.kind !== "direct") {
    const table = input.kind === "week" ? "weeks" : "calendar_slots";
    const targetId = input.kind === "week" ? input.week_id : input.slot_id;
    const { data, error } = await db.from(table).select("*").eq("id", targetId).eq("company_id", companyId).maybeSingle();
    if (error) throw new ApiProductionQueueError("Could not check the production source. Please retry.", 500, "QUEUE_FAILED");
    if (!data) throw new ApiProductionQueueError("The production source was not found for this company.", 404, "NOT_FOUND");
    if (input.kind === "week") week = data;
  }

  // Old queued rows remain owned by their existing executor. Never relabel them.
  const { data: legacy, error: legacyError } = await db.from("content_generation_jobs").select("id")
    .eq("company_id", companyId).in("job_type", ["weekly_production", "single_post", "video_post"]).in("status", ["queued", "running"]).limit(1);
  if (legacyError) throw new ApiProductionQueueError("Could not check existing production work. Please retry.", 500, "QUEUE_FAILED");
  if (legacy?.length) throw new ApiProductionQueueError("A previous local production job is still queued or running. Resolve or cancel it before starting API production.");

  const id = apiProductionJobId(companyId, input);
  const { data: inserted, error: insertError } = await db.from("content_generation_jobs").insert({
    id, company_id: companyId, week_id: input.kind === "week" ? input.week_id : null,
    job_type: API_PRODUCTION_JOB_TYPE, provider: API_PRODUCTION_PROVIDER,
    status: "queued", input_payload: input, output_payload: {}, triggered_by: actorId,
    run_id: randomUUID(), attempt: 0, max_attempts: 3,
  }).select("*").single();
  let job = inserted as ApiProductionJob | null;
  if (insertError) {
    if (insertError.code !== "23505") throw new ApiProductionQueueError("Could not queue API production. Please retry.", 500, "QUEUE_FAILED");
    const { data, error } = await db.from("content_generation_jobs").select("*").eq("id", id).eq("company_id", companyId).eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE).maybeSingle();
    if (error) throw new ApiProductionQueueError("Could not read the existing API production job. Please retry.", 500, "QUEUE_FAILED");
    if (!data) throw new ApiProductionQueueError("Production is already queued for this week. Wait for it to finish.");
    job = data as ApiProductionJob;
    // Concurrent requests reuse a live job. A completed direct/slot request is immutable.
    if (["queued", "running"].includes(job.status) || job.status === "completed" && input.kind !== "week") return job;
    // A cron-driven parent must not reset a terminal child. Only the authenticated
    // human retry path opts in, and week retries reopen failed children explicitly.
    if (job.status === "failed" && !args.retryFailed) return job;
    if (job.status === "failed" && args.retryFailed && week) await resetFailedWeekChildren(db, companyId, actorId, week);
    const { data: reset, error: resetError } = await db.from("content_generation_jobs").update({
      status: "queued", input_payload: input, error_message: null, completed_at: null,
      worker_id: null, lease_expires_at: null, heartbeat_at: null, attempt: 0,
      triggered_by: actorId, run_id: randomUUID(),
    }).eq("id", id).eq("company_id", companyId).eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE)
      .eq("status", job.status).eq("run_id", job.run_id).select("*").maybeSingle();
    if (resetError) throw new ApiProductionQueueError("Could not resume API production. Please retry.", 500, "QUEUE_FAILED");
    if (!reset) {
      const { data: live, error: liveError } = await db.from("content_generation_jobs").select("*").eq("id", id).eq("company_id", companyId).eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE).maybeSingle();
      if (liveError || !live) throw new ApiProductionQueueError("Could not read the resumed production job.", 500, "QUEUE_FAILED");
      return live as ApiProductionJob;
    }
    job = reset as ApiProductionJob;
  }
  if (!job) throw new ApiProductionQueueError("Could not queue API production. Please retry.", 500, "QUEUE_FAILED");
  if (week) {
    let mirror = db.from("weeks").update({ run_state: "queued", current_job_id: id, current_phase: "API writing queued", last_error: null, last_run_at: new Date().toISOString() }).eq("id", week.id).eq("company_id", companyId);
    mirror = week.current_job_id ? mirror.eq("current_job_id", week.current_job_id) : mirror.is("current_job_id", null);
    const { error } = await mirror;
    if (error) throw new ApiProductionQueueError("Production is queued, but the week status could not be updated. Please reload.", 500, "QUEUE_FAILED");
  }
  return job;
}
