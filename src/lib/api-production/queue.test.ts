import { describe, expect, it } from "vitest";
import { apiProductionJobId, queueApiProductionJob } from "./queue";
import { productionTestDb } from "./fake-db.test-helper";

const week = { id: "week-a", company_id: "a", current_job_id: null, run_state: "idle", status: "approved" };
const slot = { id: "slot-a", company_id: "a", slot_date: "2026-10-19" };
const brief = { post_type_slug: "insight", topic: "Verified topic", post_date: "2026-10-19" };
const args = { companyId: "a", actorId: "admin", input: { kind: "direct" as const, direct: brief } };

describe("API production queue", () => {
  it("concurrent duplicate requests atomically share one API-owned row", async () => {
    const { db, tables } = productionTestDb();
    const jobs = await Promise.all([queueApiProductionJob(db, args), queueApiProductionJob(db, args)]);
    expect(jobs[0].id).toBe(jobs[1].id);
    expect(tables.content_generation_jobs).toHaveLength(1);
    expect(tables.content_generation_jobs[0]).toMatchObject({ job_type: "content_generation", provider: "api_engine", status: "queued", week_id: null });
  });
  it("does not queue a calendar source owned by another company", async () => {
    const { db, tables } = productionTestDb({ calendar_slots: [slot] });
    await expect(queueApiProductionJob(db, { ...args, companyId: "b", input: { kind: "slot", slot_id: slot.id } })).rejects.toMatchObject({ status: 404 });
    expect(tables.content_generation_jobs).toBeUndefined();
  });
  it("rejects impossible calendar dates and unknown post types before writing", async () => {
    const { db, tables } = productionTestDb();
    await expect(queueApiProductionJob(db, { ...args, input: { kind: "direct", direct: { ...brief, post_date: "2026-02-30" } } })).rejects.toMatchObject({ status: 400, code: "INVALID_INPUT" });
    await expect(queueApiProductionJob(db, { ...args, input: { kind: "direct", direct: { ...brief, post_type_slug: "made_up_type" } } })).rejects.toMatchObject({ status: 400, code: "INVALID_INPUT" });
    expect(tables.content_generation_jobs).toBeUndefined();
  });
  it("preserves a completed direct request and its saved result", async () => {
    const id = apiProductionJobId("a", args.input);
    const { db, tables } = productionTestDb({ content_generation_jobs: [{ id, company_id: "a", job_type: "content_generation", provider: "api_engine", status: "completed", output_payload: { content_piece_id: "piece-a" } }] });
    const result = await queueApiProductionJob(db, args);
    expect(result.output_payload?.content_piece_id).toBe("piece-a");
    expect(tables.content_generation_jobs[0].status).toBe("completed");
  });
  it("resumes failed jobs on explicit retry without deleting their checkpoint", async () => {
    const id = apiProductionJobId("a", args.input);
    const { db, tables } = productionTestDb({ content_generation_jobs: [{ id, company_id: "a", job_type: "content_generation", provider: "api_engine", status: "failed", run_id: "old", output_payload: { slots: { first: "piece-a" } }, attempt: 3 }] });
    await queueApiProductionJob(db, { ...args, retryFailed: true });
    expect(tables.content_generation_jobs[0]).toMatchObject({ status: "queued", attempt: 0, output_payload: { slots: { first: "piece-a" } } });
  });
  it("does not reset an exhausted job unless the request is an explicit human retry", async () => {
    const id = apiProductionJobId("a", args.input);
    const seed = { content_generation_jobs: [{ id, company_id: "a", job_type: "content_generation", provider: "api_engine", status: "failed", run_id: "old", output_payload: { content_piece_id: "piece-a" }, attempt: 3 }] };
    const first = productionTestDb(seed);
    const untouched = await queueApiProductionJob(first.db, args);
    expect(untouched.status).toBe("failed");
    expect(first.tables.content_generation_jobs[0]).toMatchObject({ status: "failed", attempt: 3 });

    const second = productionTestDb(seed);
    const retried = await queueApiProductionJob(second.db, { ...args, retryFailed: true });
    expect(retried.status).toBe("queued");
    expect(second.tables.content_generation_jobs[0]).toMatchObject({ status: "queued", attempt: 0, output_payload: { content_piece_id: "piece-a" } });
  });
  it("only explicit week retry resets its terminal child and preserves the generation checkpoint", async () => {
    const input = { kind: "week" as const, week_id: "week-a" };
    const parentId = apiProductionJobId("a", input);
    const childId = apiProductionJobId("a", { kind: "slot", slot_id: "slot-a" });
    const seed = {
      weeks: [{ ...week, date_start: "2026-10-19", date_end: "2026-10-25", current_job_id: parentId }],
      calendar_slots: [{ ...slot, slot_date: "2026-10-20" }],
      content_generation_jobs: [
        { id: parentId, company_id: "a", week_id: "week-a", job_type: "content_generation", provider: "api_engine", status: "failed", run_id: "parent-old", attempt: 3, output_payload: { slots: { done: "piece-done" } } },
        { id: childId, company_id: "a", job_type: "content_generation", provider: "api_engine", status: "failed", run_id: "child-old", attempt: 3, output_payload: { generation_checkpoint: { piece_id: "piece-retry", company_id: "a" } } },
      ],
    };
    const automatic = productionTestDb(seed);
    await queueApiProductionJob(automatic.db, { ...args, input });
    expect(automatic.tables.content_generation_jobs.find(row => row.id === childId)).toMatchObject({ status: "failed", attempt: 3 });

    const human = productionTestDb(seed);
    await queueApiProductionJob(human.db, { ...args, input, retryFailed: true });
    expect(human.tables.content_generation_jobs.find(row => row.id === childId)).toMatchObject({ status: "queued", attempt: 0, output_payload: { generation_checkpoint: { piece_id: "piece-retry", company_id: "a" } } });
  });
  it("reopens a completed week for new unfinished slots and mirrors run state without editorial changes", async () => {
    const input = { kind: "week" as const, week_id: week.id };
    const id = apiProductionJobId("a", input);
    const { db, tables } = productionTestDb({ weeks: [week], content_generation_jobs: [{ id, company_id: "a", week_id: week.id, job_type: "content_generation", provider: "api_engine", status: "completed", run_id: "old", output_payload: { slots: { first: "piece-a" } } }] });
    await queueApiProductionJob(db, { ...args, input });
    expect(tables.weeks[0]).toMatchObject({ run_state: "queued", current_job_id: id, last_error: null, status: "approved" });
    expect(tables.content_generation_jobs[0].output_payload.slots.first).toBe("piece-a");
  });
  it("refuses to take over queued legacy Mac work", async () => {
    const { db, tables } = productionTestDb({ content_generation_jobs: [{ id: "legacy", company_id: "a", job_type: "weekly_production", provider: "claude", status: "running" }] });
    await expect(queueApiProductionJob(db, args)).rejects.toMatchObject({ status: 409 });
    expect(tables.content_generation_jobs).toHaveLength(1);
    expect(tables.content_generation_jobs[0].provider).toBe("claude");
  });
  it("reports a failed week mirror instead of silently claiming it queued cleanly", async () => {
    const { db, fail } = productionTestDb({ weeks: [week] });
    fail["weeks:update"] = "database unavailable";
    await expect(queueApiProductionJob(db, { ...args, input: { kind: "week", week_id: week.id } })).rejects.toMatchObject({ status: 500, message: expect.stringContaining("week status") });
  });
});
