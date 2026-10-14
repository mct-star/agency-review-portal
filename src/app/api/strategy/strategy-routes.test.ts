import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

/**
 * Strategise must work end to end for a business-to-business client: the
 * interview saves with what the component sends, and the pillar suggestions
 * refuse a caller from another company. Two companies, the caller in A.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state: {
  user: Record<string, unknown> | null;
  supabase: ReturnType<typeof fakeSupabase>;
  generate: Mock<(opts: Record<string, unknown>) => Promise<unknown>>;
} = { user: null, supabase: fakeSupabase(), generate: vi.fn() };

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  createAdminSupabaseClient: async () => state.supabase.client,
}));
vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => state.user,
  createServerSupabaseClient: async () => state.supabase.client,
}));
vi.mock("@/lib/hospitality/pack-guard", () => ({ refuseHospitality: async () => null }));
vi.mock("@/lib/providers", () => ({ resolveProvider: async () => null }));
vi.mock("@/lib/providers/content-generation/generate-text", () => ({
  generateText: (opts: Record<string, unknown>) => state.generate(opts),
}));

import { POST as interview } from "./interview/route";
import { POST as suggestPillars } from "./suggest-pillars/route";

const post = (body: Record<string, unknown>) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const inserted = (calls: RecordedCall[], table: string) =>
  calls.filter((c) => c.table === table && c.method === "insert").map((c) => c.args[0] as Record<string, unknown>);

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A };
  state.generate = vi.fn();
  state.supabase = fakeSupabase({
    strategy_sessions: (calls) =>
      calls.some((c) => c.method === "insert")
        ? { data: { id: "s1", company_id: A, current_step: 2, responses: { "1": { companyName: "Acme" } } } }
        : { data: null },
  });
});

describe("strategy interview", () => {
  it("saves when the component sends currentStep rather than step", async () => {
    const res = await interview(post({ companyId: A, currentStep: 2, responses: { "1": { companyName: "Acme" } } }));
    expect(res.status).toBe(200);
    expect(inserted(state.supabase.calls, "strategy_sessions")[0]).toMatchObject({ company_id: A, current_step: 2 });
  });
  it("prefers step when both are sent", async () => {
    const res = await interview(post({ companyId: A, step: 3, currentStep: 2, responses: {} }));
    expect(res.status).toBe(200);
    expect(inserted(state.supabase.calls, "strategy_sessions")[0]).toMatchObject({ current_step: 3 });
  });
  it("still needs a step of some kind", async () => {
    const res = await interview(post({ companyId: A, responses: {} }));
    expect(res.status).toBe(400);
  });
  it("refuses another company's interview", async () => {
    const res = await interview(post({ companyId: B, currentStep: 2, responses: {} }));
    expect(res.status).toBe(403);
  });
});

describe("suggest pillars", () => {
  it("refuses a caller from another company before calling the model", async () => {
    const res = await suggestPillars(post({ companyId: B, responses: {} }));
    expect(res.status).toBe(401);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("returns the pillars for the caller's own company, asking for structured output", async () => {
    state.generate.mockResolvedValue({
      text: JSON.stringify({ pillars: [{ name: "Launch lessons", description: "What launches teach.", topics: ["One"] }] }),
      provider: "claude",
      model: "m",
    });
    const res = await suggestPillars(post({ companyId: A, responses: { "1": { whatDo: "Launches" } } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pillars: [{ name: "Launch lessons", description: "What launches teach.", topics: ["One"] }] });
    expect(state.generate.mock.calls[0][0]).toHaveProperty("jsonSchema");
  });
  it("says so plainly when the provider fails", async () => {
    state.generate.mockRejectedValue(new Error("down"));
    const res = await suggestPillars(post({ companyId: A, responses: {} }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("We could not suggest pillars just now. Add your own and carry on.");
  });
});
