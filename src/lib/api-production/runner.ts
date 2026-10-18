/** Hosted API job runner used by authenticated enqueue routes and the Vercel recovery cron. */
import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { CalendarSlot } from "@/types/database";
import { generatePlannedPiece } from "./generate";
import { apiProductionJobId, queueApiProductionJob } from "./queue";
import { API_PRODUCTION_JOB_TYPE, API_PRODUCTION_PROVIDER, type ApiProductionJob, type ApiProductionOutput, type ProductionDb } from "./types";

const LEASE_MS = 10 * 60_000;
const activeStatuses = ["planned", "briefed"];
class LeaseLost extends Error { constructor() { super("This production attempt no longer owns its lease."); } }

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "API production could not finish. Please retry.";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/(?:sk-[\w-]+|AIza[\w-]+)/g, "[redacted]").slice(0, 500);
}

function jobs(db: ProductionDb) { return db.from("content_generation_jobs"); }

async function readJob(db: ProductionDb, id: string, companyId?: string): Promise<ApiProductionJob | null> {
  let query = jobs(db).select("*").eq("id", id).eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Could not read the API production job. Please retry.");
  return data as ApiProductionJob | null;
}

async function claim(db: ProductionDb, job: ApiProductionJob): Promise<ApiProductionJob | null> {
  if (job.status !== "queued" && job.status !== "running") return null;
  const now = new Date().toISOString();
  if (job.status === "running" && job.lease_expires_at && job.lease_expires_at >= now) return null;
  const workerId = randomUUID();
  let update = jobs(db).update({ status: "running", worker_id: workerId, started_at: now, heartbeat_at: now,
    lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(), attempt: (job.attempt || 0) + 1, error_message: null,
  }).eq("id", job.id).eq("company_id", job.company_id).eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE).eq("status", job.status);
  if (job.status === "running") {
    update = job.lease_expires_at ? update.eq("lease_expires_at", job.lease_expires_at).lt("lease_expires_at", now) : update.is("lease_expires_at", null);
    update = job.worker_id ? update.eq("worker_id", job.worker_id) : update.is("worker_id", null);
  }
  const { data, error } = await update.select("*").maybeSingle();
  if (error) throw new Error("Could not claim API production. Please retry.");
  return data as ApiProductionJob | null;
}

function ownedUpdate(db: ProductionDb, job: ApiProductionJob, values: Record<string, unknown>) {
  return jobs(db).update(values).eq("id", job.id).eq("company_id", job.company_id).eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE)
    .eq("worker_id", job.worker_id).eq("status", "running").gt("lease_expires_at", new Date().toISOString());
}

async function assertOwnership(db: ProductionDb, job: ApiProductionJob) {
  const now = new Date().toISOString();
  const { data, error } = await ownedUpdate(db, job, { heartbeat_at: now, lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString() }).select("id").maybeSingle();
  if (error) throw new Error("Could not renew the API production lease. Please retry.");
  if (!data) throw new LeaseLost();
}

async function mirrorWeek(db: ProductionDb, job: ApiProductionJob, values: Record<string, unknown>) {
  if (job.input_payload.kind !== "week" || !job.week_id) return;
  const { error } = await db.from("weeks").update(values).eq("id", job.week_id).eq("company_id", job.company_id).eq("current_job_id", job.id);
  if (error) throw new Error("Could not update the week production status. Please retry.");
}

async function saveState(db: ProductionDb, job: ApiProductionJob, output: ApiProductionOutput, complete: boolean) {
  const now = new Date().toISOString();
  const { data, error } = await ownedUpdate(db, job, {
    status: complete ? "completed" : "queued", output_payload: output,
    content_piece_id: output.content_piece_id || null,
    progress: complete ? 100 : Math.min(95, Object.keys(output.slots || {}).length * 10),
    completed_at: complete ? now : null, worker_id: null, lease_expires_at: null,
    heartbeat_at: now, attempt: 0, error_message: null,
  }).select("id").maybeSingle();
  if (error) throw new Error("Could not save the API production checkpoint. Please retry.");
  if (!data) throw new LeaseLost();
  await mirrorWeek(db, job, { run_state: complete ? "complete" : "queued", current_phase: complete ? "API writing complete" : "API writing continuing", last_error: null });
}

async function weekSlots(db: ProductionDb, job: ApiProductionJob): Promise<CalendarSlot[]> {
  const { data: week, error: weekError } = await db.from("weeks").select("id, date_start, date_end").eq("id", job.week_id).eq("company_id", job.company_id).maybeSingle();
  if (weekError) throw new Error("Could not read the production week. Please retry.");
  if (!week) throw new Error("The production week was not found for this company.");
  const { data, error } = await db.from("calendar_slots").select("*").eq("company_id", job.company_id)
    .gte("slot_date", week.date_start).lte("slot_date", week.date_end).order("slot_date", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error("Could not read this week's calendar slots. Please retry.");
  return (data || []) as CalendarSlot[];
}

async function runWeek(db: ProductionDb, job: ApiProductionJob) {
  if (!job.week_id || job.week_id !== job.input_payload.week_id) throw new Error("The production week is missing or inconsistent.");
  const slots = await weekSlots(db, job);
  if (!slots.length) throw new Error("This week has no calendar slots. Add the planned content before running production.");
  const output: ApiProductionOutput = { ...job.output_payload, slots: { ...job.output_payload?.slots } };
  const remaining: CalendarSlot[] = [];
  for (const slot of slots) {
    if (output.slots?.[slot.id]) continue;
    if (activeStatuses.includes(slot.status)) {
      remaining.push(slot);
      continue;
    }
    // A non-active slot is recoverable only when this company already has the
    // matching API child. Never create new work for unrelated written/editorial slots.
    const child = await readJob(db, apiProductionJobId(job.company_id, { kind: "slot", slot_id: slot.id }), job.company_id);
    if (!child) continue;
    if (child.status === "completed" && child.output_payload?.content_piece_id) {
      output.slots![slot.id] = child.output_payload.content_piece_id;
      output.warnings = Array.from(new Set([...(output.warnings || []), ...(child.output_payload.warnings || [])]));
    } else if (["queued", "running", "failed"].includes(child.status)) {
      remaining.push(slot);
    }
  }
  if (!remaining.length) { await saveState(db, job, output, true); return; }
  // One child per invocation bounds runtime and shares the single-post claim fence.
  const slot = remaining[0];
  if (slot.anchor_pending) throw new Error(`The source for ${slot.slot_date} is still pending. Add its source before retrying production.`);
  await assertOwnership(db, job);
  const child = await queueApiProductionJob(db, { companyId: job.company_id, actorId: null, input: { kind: "slot", slot_id: slot.id } });
  if (child.status !== "completed") await runWithDb(db, child.id, job.company_id);
  await assertOwnership(db, job);
  const finished = await readJob(db, child.id, job.company_id);
  if (finished?.status === "failed") throw new Error(String((finished as ApiProductionJob & { error_message?: string }).error_message || "A calendar post could not be written. Please retry."));
  if (finished && ["queued", "running"].includes(finished.status)) {
    await saveState(db, job, output, false);
    return;
  }
  if (finished?.status === "completed" && finished.output_payload?.content_piece_id) {
    output.slots![slot.id] = finished.output_payload.content_piece_id;
    output.warnings = Array.from(new Set([...(output.warnings || []), ...(finished.output_payload.warnings || [])]));
  }
  const currentSlots = await weekSlots(db, job);
  const hasRemaining = currentSlots.some((item) => activeStatuses.includes(item.status) && !output.slots?.[item.id]);
  await saveState(db, job, output, !hasRemaining);
}

async function runWithDb(db: ProductionDb, id: string, companyId?: string): Promise<void> {
  const snapshot = await readJob(db, id, companyId);
  if (!snapshot) return;
  const job = await claim(db, snapshot);
  if (!job) return;
  try {
    if ((job.attempt || 1) > (job.max_attempts || 3)) throw new Error("API production was interrupted repeatedly. Check the output and retry to resume safely.");
    await mirrorWeek(db, job, { run_state: "running", current_phase: "Writing through the API", last_error: null });
    if (job.input_payload.kind === "week") { await runWeek(db, job); return; }
    let slot: CalendarSlot | undefined;
    if (job.input_payload.kind === "slot") {
      const { data, error } = await db.from("calendar_slots").select("*").eq("id", job.input_payload.slot_id).eq("company_id", job.company_id).maybeSingle();
      if (error) throw new Error("Could not read the calendar slot. Please retry.");
      if (!data) throw new Error("The calendar slot was not found for this company.");
      slot = data as CalendarSlot;
      // Existing editorial decisions are never overwritten by a resumed worker.
      if (!activeStatuses.includes(slot.status)) {
        const checkpoint = job.output_payload?.generation_checkpoint as {
          job_id?: string; company_id?: string; piece_id?: string; slot_id?: string | null;
        } | undefined;
        if (checkpoint?.job_id === job.id && checkpoint.company_id === job.company_id
          && checkpoint.slot_id === slot.id && checkpoint.piece_id) {
          const { data: savedPiece, error: pieceError } = await db.from("content_pieces").select("id, company_id, generation_job_id, cover_image_url")
            .eq("id", checkpoint.piece_id).eq("company_id", job.company_id).eq("generation_job_id", job.id).maybeSingle();
          if (pieceError) throw new Error("Could not verify the saved content for this company. Please retry.");
          if (savedPiece?.id) {
            await saveState(db, job, { ...job.output_payload, content_piece_id: savedPiece.id,
              ...(savedPiece.cover_image_url ? { image_url: savedPiece.cover_image_url } : {}),
              warnings: [`The calendar slot is ${slot.status}; its existing editorial status was preserved.`] }, true);
            return;
          }
        }
        await saveState(db, job, { ...job.output_payload, warnings: [`This calendar slot is ${slot.status}; its existing content was preserved.`] }, true);
        return;
      }
      if (slot.anchor_pending) throw new Error("This calendar slot is waiting for its source. Add the source before retrying production.");
    } else if (job.input_payload.kind !== "direct") throw new Error("The API production request is invalid.");
    await assertOwnership(db, job);
    const result = await generatePlannedPiece({ db, job, workerId: job.worker_id!, slot, assertOwnership: () => assertOwnership(db, job) });
    await assertOwnership(db, job);
    if (slot) {
      const { error } = await db.from("calendar_slots").update({ status: "written" }).eq("id", slot.id).eq("company_id", job.company_id).in("status", activeStatuses);
      if (error) throw new Error("The post was saved, but its calendar status could not be updated. Retry to resume safely.");
    }
    await saveState(db, job, { ...job.output_payload, content_piece_id: result.pieceId, image_url: result.imageUrl, warnings: result.warnings }, true);
  } catch (error) {
    if (error instanceof LeaseLost) return;
    const message = safeError(error);
    const retry = (job.attempt || 1) < (job.max_attempts || 3);
    const { data, error: failError } = await ownedUpdate(db, job, {
      status: retry ? "queued" : "failed", error_message: message,
      completed_at: retry ? null : new Date().toISOString(), worker_id: null,
      lease_expires_at: null,
    }).select("id").maybeSingle();
    if (failError) throw new Error("Could not record the failed API production attempt. Its lease will expire for safe recovery.");
    if (data) await mirrorWeek(db, job, {
      run_state: retry ? "queued" : "failed",
      current_phase: retry ? "API writing will retry" : "API writing needs attention",
      last_error: message,
    });
    else if (/week production status/.test(message)) throw error;
  }
}

/** A trusted server entry point; browser requests must use the authenticated enqueue routes. */
export async function runApiProductionJob(jobId: string, companyId?: string): Promise<void> {
  await runWithDb(await createAdminSupabaseClient(), jobId, companyId);
}

/** Recover only this executor's queued or expired work, one bounded job per cron invocation. */
export async function runApiProductionBatch(): Promise<{ attempted: number; results: Array<{ jobId: string; ok: boolean; error?: string }> }> {
  const db = await createAdminSupabaseClient();
  const now = new Date().toISOString();
  const rows = await Promise.all([
    jobs(db).select("id, company_id, created_at").eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE).eq("status", "queued").order("created_at", { ascending: true }).limit(1),
    jobs(db).select("id, company_id, created_at").eq("provider", API_PRODUCTION_PROVIDER).eq("job_type", API_PRODUCTION_JOB_TYPE).eq("status", "running").or(`lease_expires_at.lt.${now},lease_expires_at.is.null`).order("created_at", { ascending: true }).limit(1),
  ]);
  if (rows.some((result) => result.error)) throw new Error("Could not read the API recovery queue.");
  const next = rows.flatMap((result) => result.data || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  if (!next) return { attempted: 0, results: [] };
  try {
    await runWithDb(db, next.id, next.company_id);
    const result = await readJob(db, next.id, next.company_id);
    const error = result?.status === "failed" ? String((result as ApiProductionJob & { error_message?: string }).error_message || "API production needs attention.") : undefined;
    return { attempted: 1, results: [{ jobId: next.id, ok: !error, ...(error ? { error } : {}) }] };
  }
  catch (error) { return { attempted: 1, results: [{ jobId: next.id, ok: false, error: safeError(error) }] }; }
}
