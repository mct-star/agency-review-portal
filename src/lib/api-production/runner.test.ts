import { beforeEach, describe, expect, it, vi } from "vitest";
import { productionTestDb } from "./fake-db.test-helper";
import { apiProductionJobId } from "./queue";

const mocks = vi.hoisted(() => ({ createDb: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createDb }));
vi.mock("./generate", () => ({ generatePlannedPiece: mocks.generate }));

import { runApiProductionJob } from "./runner";
import { API_PRODUCTION_JOB_TYPE, API_PRODUCTION_PROVIDER } from "./types";

const job = {
  id: "job-a", company_id: "company-a", week_id: null,
  provider: API_PRODUCTION_PROVIDER, job_type: API_PRODUCTION_JOB_TYPE,
  status: "queued", input_payload: { kind: "direct", direct: { post_type_slug: "insight", topic: "Topic", post_date: "2026-10-19" } },
  output_payload: { slots: { saved: "piece-saved" } }, attempt: 0, max_attempts: 3,
};

describe("API production runner", () => {
  beforeEach(() => {
    mocks.createDb.mockReset();
    mocks.generate.mockReset();
  });

  it("claims a queued row once when two kicks race", async () => {
    const { db, tables, calls } = productionTestDb({ content_generation_jobs: [job] });
    mocks.createDb.mockResolvedValue(db);
    mocks.generate.mockResolvedValue({ pieceId: "piece-new", warnings: [] });

    await Promise.all([runApiProductionJob(job.id, job.company_id), runApiProductionJob(job.id, job.company_id)]);

    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(tables.content_generation_jobs[0]).toMatchObject({ status: "completed", content_piece_id: "piece-new", output_payload: { slots: { saved: "piece-saved" }, content_piece_id: "piece-new" } });
    expect(calls.filter((call) => call.table === "content_generation_jobs" && call.action === "update").some((call) => call.filters.includes("company_id=eq:company-a"))).toBe(true);
  });

  it("does not claim a job for a different company", async () => {
    const { db, tables } = productionTestDb({ content_generation_jobs: [job] });
    mocks.createDb.mockResolvedValue(db);

    await runApiProductionJob(job.id, "company-b");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(tables.content_generation_jobs[0].status).toBe("queued");
  });

  it("abandons generation after the lease expires before persistence", async () => {
    const { db, tables } = productionTestDb({ content_generation_jobs: [job] });
    mocks.createDb.mockResolvedValue(db);
    mocks.generate.mockImplementation(async ({ assertOwnership }) => {
      tables.content_generation_jobs[0].lease_expires_at = "2000-01-01T00:00:00.000Z";
      await assertOwnership();
      return { pieceId: "must-not-save", warnings: [] };
    });

    await runApiProductionJob(job.id, job.company_id);

    expect(tables.content_generation_jobs[0].status).toBe("running");
    expect(tables.content_generation_jobs[0].content_piece_id).toBeUndefined();
  });

  it("retries owned failures to the maximum and preserves checkpoints", async () => {
    const { db, tables } = productionTestDb({ content_generation_jobs: [job] });
    mocks.createDb.mockResolvedValue(db);
    mocks.generate.mockRejectedValue(new Error("temporary provider error"));

    await runApiProductionJob(job.id, job.company_id);
    expect(tables.content_generation_jobs[0]).toMatchObject({ status: "queued", attempt: 1, output_payload: { slots: { saved: "piece-saved" } } });
    await runApiProductionJob(job.id, job.company_id);
    expect(tables.content_generation_jobs[0]).toMatchObject({ status: "queued", attempt: 2 });
    await runApiProductionJob(job.id, job.company_id);
    expect(tables.content_generation_jobs[0]).toMatchObject({ status: "failed", attempt: 3, output_payload: { slots: { saved: "piece-saved" } } });
  });

  it("stops a weekly parent after its child exhausts retries instead of resetting the child on cron", async () => {
    const weekJob = { ...job, id: "week-job", week_id: "week-a", status: "queued", input_payload: { kind: "week", week_id: "week-a", mode: "resume" }, output_payload: { slots: {} } };
    const childId = apiProductionJobId("company-a", { kind: "slot", slot_id: "slot-a" });
    const { db, tables } = productionTestDb({
      weeks: [{ id: "week-a", company_id: "company-a", date_start: "2026-10-19", date_end: "2026-10-25", current_job_id: "week-job", run_state: "queued" }],
      calendar_slots: [{ id: "slot-a", company_id: "company-a", slot_date: "2026-10-20", status: "planned", anchor_pending: false, source_anchor: "Verified source", topic: "Topic", week_id: "week-a" }],
      content_generation_jobs: [weekJob, { id: childId, company_id: "company-a", provider: API_PRODUCTION_PROVIDER, job_type: API_PRODUCTION_JOB_TYPE, status: "failed", attempt: 3, max_attempts: 3, error_message: "Permanent child failure", input_payload: { kind: "slot", slot_id: "slot-a" }, output_payload: { generation_checkpoint: { piece_id: "piece-checkpoint" } } }],
    });
    mocks.createDb.mockResolvedValue(db);

    await runApiProductionJob("week-job", "company-a");
    expect(tables.content_generation_jobs.find(row => row.id === childId)).toMatchObject({ status: "failed", attempt: 3 });
    expect(tables.content_generation_jobs.find(row => row.id === "week-job")).toMatchObject({ status: "queued", attempt: 1 });
    await runApiProductionJob("week-job", "company-a");
    await runApiProductionJob("week-job", "company-a");
    expect(tables.content_generation_jobs.find(row => row.id === childId)).toMatchObject({ status: "failed", attempt: 3 });
    expect(tables.content_generation_jobs.find(row => row.id === "week-job")).toMatchObject({ status: "failed", attempt: 3 });
  });

  it("recovers a verified generated piece when a calendar status was written before the job output link", async () => {
    const slotJob = {
      ...job, id: "slot-job", status: "queued", input_payload: { kind: "slot", slot_id: "slot-a" },
      output_payload: { generation_checkpoint: { job_id: "slot-job", company_id: "company-a", piece_id: "piece-saved", slot_id: "slot-a" } },
    };
    const slot = { id: "slot-a", company_id: "company-a", status: "written", slot_date: "2026-10-20", anchor_pending: false };
    const piece = { id: "piece-saved", company_id: "company-a", generation_job_id: "slot-job", approval_status: "pending", title: "Saved title", markdown_body: "Saved body" };
    const { db, tables } = productionTestDb({ content_generation_jobs: [slotJob], calendar_slots: [slot], content_pieces: [piece] });
    mocks.createDb.mockResolvedValue(db);

    await runApiProductionJob("slot-job", "company-a");

    expect(tables.calendar_slots[0].status).toBe("written");
    expect(tables.content_generation_jobs[0]).toMatchObject({ status: "completed", content_piece_id: "piece-saved", output_payload: { content_piece_id: "piece-saved" } });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("recovers a written week slot's expired API child and records its piece link", async () => {
    const parent = { ...job, id: "week-job", week_id: "week-a", status: "queued", input_payload: { kind: "week", week_id: "week-a", mode: "resume" }, output_payload: { slots: {} } };
    const childId = apiProductionJobId("company-a", { kind: "slot", slot_id: "slot-a" });
    const child = {
      ...job, id: childId, week_id: null, status: "running", worker_id: "old-worker",
      lease_expires_at: "2000-01-01T00:00:00.000Z", input_payload: { kind: "slot", slot_id: "slot-a" },
      output_payload: { generation_checkpoint: { job_id: childId, company_id: "company-a", piece_id: "piece-saved", slot_id: "slot-a" } },
    };
    const seed = {
      weeks: [{ id: "week-a", company_id: "company-a", date_start: "2026-10-19", date_end: "2026-10-25", current_job_id: "week-job", run_state: "queued" }],
      calendar_slots: [{ id: "slot-a", company_id: "company-a", slot_date: "2026-10-20", status: "written", anchor_pending: false }],
      content_generation_jobs: [parent, child],
      content_pieces: [{ id: "piece-saved", company_id: "company-a", generation_job_id: childId, approval_status: "pending", title: "Saved title", markdown_body: "Saved body" }],
    };
    const { db, tables } = productionTestDb(seed);
    mocks.createDb.mockResolvedValue(db);

    await runApiProductionJob("week-job", "company-a");

    expect(tables.calendar_slots[0].status).toBe("written");
    expect(tables.content_generation_jobs.find(row => row.id === childId)).toMatchObject({ status: "completed", content_piece_id: "piece-saved" });
    expect(tables.content_generation_jobs.find(row => row.id === "week-job")).toMatchObject({ status: "completed", output_payload: { slots: { "slot-a": "piece-saved" } } });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not create API child work for an unrelated written slot", async () => {
    const parent = { ...job, id: "week-job", week_id: "week-a", status: "queued", input_payload: { kind: "week", week_id: "week-a", mode: "resume" }, output_payload: { slots: {} } };
    const seed = {
      weeks: [{ id: "week-a", company_id: "company-a", date_start: "2026-10-19", date_end: "2026-10-25", current_job_id: "week-job", run_state: "queued" }],
      calendar_slots: [{ id: "slot-a", company_id: "company-a", slot_date: "2026-10-20", status: "written", anchor_pending: false }],
      content_generation_jobs: [parent],
    };
    const { db, tables } = productionTestDb(seed);
    mocks.createDb.mockResolvedValue(db);

    await runApiProductionJob("week-job", "company-a");

    expect(tables.content_generation_jobs).toHaveLength(1);
    expect(tables.calendar_slots[0].status).toBe("written");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
