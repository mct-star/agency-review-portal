import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>>, processed: [] as string[] }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({
    from: () => {
      let action: "select" | "update" = "select";
      let values: Record<string, unknown> = {};
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      const chain: Record<string, any> = {};
      chain.select = () => chain;
      chain.eq = (key: string, value: unknown) => { filters.push((row) => row[key] === value); return chain; };
      chain.in = (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return chain; };
      chain.contains = (key: string, value: Record<string, unknown>) => { filters.push((row) => Object.entries(value).every(([k, v]) => row[key]?.[k] === v)); return chain; };
      chain.or = (expression: string) => { filters.push((row) => !row.scheduled_for || Date.parse(row.scheduled_for) <= Date.parse(expression.split("lte.")[1])); return chain; };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.lte = () => chain;
      chain.update = (patch: Record<string, unknown>) => { action = "update"; values = patch; return chain; };
      chain.maybeSingle = async () => {
        const row = state.rows.find((candidate) => filters.every((filter) => filter(candidate)));
        if (row && action === "update") Object.assign(row, values);
        return { data: row || null, error: null };
      };
      chain.then = (resolve: (value: unknown) => void) => {
        if (action === "update") {
          const found = state.rows.filter((row) => filters.every((filter) => filter(row)));
          found.forEach((row) => Object.assign(row, values));
          return Promise.resolve({ data: found.map(({ id }) => ({ id })), error: null }).then(resolve);
        }
        return Promise.resolve({ data: state.rows.filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve);
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/meta/direct-worker", () => ({ processMetaDirectJob: vi.fn(async (_db: unknown, job: { id: string }) => { state.processed.push(job.id); return "published"; }) }));

import { processMetaDirectJob } from "@/lib/meta/direct-worker";
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.mocked(processMetaDirectJob).mockClear();
  state.processed = [];
  state.rows = [
    { id: "due", company_id: "company-1", content_piece_id: "piece-1", social_account_id: "account-1", triggered_by: "user-1", target_platform: "facebook", status: "queued", scheduled_for: null, created_at: "2020-01-01T00:00:00.000Z", publish_payload: { provider: "meta-direct-v1" }, response_payload: {} },
    { id: "future", company_id: "company-1", content_piece_id: "piece-2", social_account_id: "account-1", triggered_by: "user-1", target_platform: "facebook", status: "scheduled", scheduled_for: new Date(Date.now() + 86400000).toISOString(), created_at: "2020-01-01T00:00:00.000Z", publish_payload: { provider: "meta-direct-v1" }, response_payload: {} },
    { id: "legacy-untagged", company_id: "company-1", target_platform: "facebook", status: "queued", scheduled_for: null, publish_payload: { piece_id: "piece-3" }, response_payload: {} },
    { id: "stale-run", company_id: "company-1", target_platform: "facebook", status: "running", created_at: "2020-01-01T00:00:00.000Z", publish_payload: { provider: "meta-direct-v1" }, response_payload: { attempt_started_at: new Date(Date.now() - 3600000).toISOString() } },
    { id: "old-scheduled", company_id: "company-1", target_platform: "facebook", status: "scheduled", scheduled_for: new Date(Date.now() + 3600000).toISOString(), created_at: "2020-01-01T00:00:00.000Z", publish_payload: { provider: "meta-direct-v1" }, response_payload: {} },
  ];
});

describe("GET /api/cron/meta-publishing", () => {
  it("fails closed without CRON_SECRET and requires the matching bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("http://localhost/api/cron/meta-publishing"))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await GET(new Request("http://localhost/api/cron/meta-publishing", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("claims only due direct jobs, preserves future schedules and flags stale attempts", async () => {
    const response = await GET(new Request("http://localhost/api/cron/meta-publishing", { headers: { authorization: "Bearer cron-secret" } }));
    expect(response.status).toBe(200);
    expect(state.processed).toEqual(["due"]);
    expect(state.rows.find((row) => row.id === "future")?.status).toBe("scheduled");
    expect(state.rows.find((row) => row.id === "old-scheduled")?.response_payload?.outcome_uncertain).toBeUndefined();
    expect(state.rows.find((row) => row.id === "legacy-untagged")?.status).toBe("queued");
    expect(state.rows.find((row) => row.id === "stale-run")?.response_payload?.outcome_uncertain).toBe(true);
    const again = await GET(new Request("http://localhost/api/cron/meta-publishing", { headers: { authorization: "Bearer cron-secret" } }));
    expect(again.status).toBe(200);
    expect(state.processed).toEqual(["due"]);
  });
});


afterEach(() => { vi.unstubAllEnvs(); });

it("allows only one worker to claim the same due Meta job", async () => {
  state.rows = state.rows.filter((row) => row.id === "due");
  const invoke = () => GET(new Request("http://localhost/api/cron/meta-publishing", { headers: { authorization: "Bearer cron-secret" } }));
  await Promise.all([invoke(), invoke()]);
  expect(state.processed).toEqual(["due"]);
});
