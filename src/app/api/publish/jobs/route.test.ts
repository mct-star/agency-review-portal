import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

/**
 * POST /api/publish/jobs reads the company's blog publishing config with
 * .single(). A company that also has a website pull request target
 * (github_pull_request) or blog image checks (blog_gate) row in the same
 * category must still find its publisher row (15 Nov 2026).
 */
const COMPANY = "11111111-1111-4111-8111-111111111111";
const state: { fake: ReturnType<typeof fakeSupabase> } = { fake: fakeSupabase() };

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: async () => ({ id: "admin-1", role: "admin" }),
  requireCompanyUser: async () => null,
  createAdminSupabaseClient: async () => state.fake.client,
}));

import { POST } from "./route";

const rows = [
  { id: "cfg-wordpress", provider: "wordpress" },
  { id: "cfg-pull-request", provider: "github_pull_request" },
  { id: "cfg-gate", provider: "blog_gate" },
];

/** The config read: one row only when the two non-publisher providers are left out, as .single() needs. */
function configTable(calls: RecordedCall[]) {
  const not = calls.find(c => c.method === "not");
  const kept = not && not.args[0] === "provider" && not.args[1] === "in"
    ? rows.filter(r => !String(not.args[2]).replace(/[()]/g, "").split(",").includes(r.provider))
    : rows;
  return kept.length === 1
    ? { data: { id: kept[0].id } }
    : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
}

describe("POST /api/publish/jobs, blog publishing config", () => {
  it("ignores the github_pull_request and blog_gate rows and uses the company's publisher", async () => {
    state.fake = fakeSupabase({
      company_api_configs: configTable,
      publishing_jobs: { data: { id: "job-1" } },
    });
    const res = await POST(new Request("http://localhost/api/publish/jobs", {
      method: "POST",
      body: JSON.stringify({ companyId: COMPANY, contentPieceId: "piece-1", targetPlatform: "wordpress" }),
    }));
    expect(res.status).toBe(200);
    const filter = state.fake.calls.find(c => c.table === "company_api_configs" && c.method === "not");
    expect(filter?.args).toEqual(["provider", "in", "(github_pull_request,blog_gate)"]);
    const insert = state.fake.calls.find(c => c.table === "publishing_jobs" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ company_id: COMPANY, api_config_id: "cfg-wordpress" });
  });
});
