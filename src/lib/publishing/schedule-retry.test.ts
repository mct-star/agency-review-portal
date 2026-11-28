import { beforeEach, describe, expect, it } from "vitest";
import { scheduleRetry } from "./schedule-retry";

const h = { own: { external_id: null as string | null }, siblings: [] as unknown[], updates: [] as Array<Record<string, unknown>>, updateFilters: [] as Array<[string, unknown]>, updateRows: [{ id: "job-1" }] as unknown[] };

function fake() {
  return {
    from: () => {
      let mode: "select" | "update" = "select";
      let siblingQuery = false;
      const chain: Record<string, any> = {};
      for (const m of ["select", "eq", "not", "neq", "limit"]) chain[m] = (...a: unknown[]) => { if (m === "neq") siblingQuery = true; if (mode === "update" && m === "eq") h.updateFilters.push([String(a[0]), a[1]]); return chain; };
      chain.is = (k: string, v: unknown) => { h.updateFilters.push([k, v]); return chain; };
      chain.update = (patch: Record<string, unknown>) => { mode = "update"; h.updates.push(patch); return chain; };
      chain.maybeSingle = async () => ({ data: h.own, error: null });
      chain.then = (resolve: (v: unknown) => void) => Promise.resolve(mode === "update" ? { data: h.updateRows, error: null } : { data: siblingQuery ? h.siblings : [], error: null }).then(resolve);
      return chain;
    },
  } as never;
}

const job = { id: "job-1", company_id: "co-1", content_piece_id: "piece-1", social_account_id: "acc-1", publish_payload: { provider: "linkedin-direct-v1", commentary: "Hi" } };
const transient = new Error("LinkedIn request failed (503): down");
const now = new Date("2026-12-01T08:00:00Z");

beforeEach(() => { h.own = { external_id: null }; h.siblings = []; h.updates = []; h.updateFilters = []; h.updateRows = [{ id: "job-1" }]; });

describe("scheduleRetry", () => {
  it("puts a transient failure back on the queue five minutes on, counting the retry", async () => {
    expect(await scheduleRetry(fake(), job, transient, false, now)).toBe(true);
    expect(h.updates[0]).toMatchObject({ status: "scheduled", scheduled_for: "2026-12-01T08:05:00.000Z", error_message: null });
    expect((h.updates[0].publish_payload as { retry_count: number }).retry_count).toBe(1);
    expect(h.updateFilters).toContainEqual(["status", "running"]);
    expect(h.updateFilters).toContainEqual(["external_id", null]);
  });
  it("does not retry a second time", async () => {
    expect(await scheduleRetry(fake(), { ...job, publish_payload: { ...job.publish_payload, retry_count: 1 } }, transient, false, now)).toBe(false);
    expect(h.updates).toHaveLength(0);
  });
  it("does not retry a 4xx content error", async () => {
    expect(await scheduleRetry(fake(), job, new Error("LinkedIn request failed (400): bad"), false, now)).toBe(false);
    expect(h.updates).toHaveLength(0);
  });
  it("does not retry after the post request started", async () => {
    expect(await scheduleRetry(fake(), job, transient, true, now)).toBe(false);
    expect(h.updates).toHaveLength(0);
  });
  it("does not retry when the job already has an external_id", async () => {
    h.own = { external_id: "urn:li:share:9" };
    expect(await scheduleRetry(fake(), job, transient, false, now)).toBe(false);
    expect(h.updates).toHaveLength(0);
  });
  it("does not retry when a sibling job already published the post", async () => {
    h.siblings = [{ id: "job-0" }];
    expect(await scheduleRetry(fake(), job, transient, false, now)).toBe(false);
    expect(h.updates).toHaveLength(0);
  });
  it("reports false when the guarded update matched nothing (a post ID appeared meanwhile)", async () => {
    h.updateRows = [];
    expect(await scheduleRetry(fake(), job, transient, false, now)).toBe(false);
  });
});
