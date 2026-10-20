import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  user: { id: "user-a", user_metadata: {} } as { id: string; user_metadata: Record<string, unknown> } | null,
  updateUser: vi.fn(),
  admin: null as unknown as ReturnType<typeof fakeSupabase>,
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ auth: {
  getUser: async () => ({ data: { user: state.user } }), updateUser: state.updateUser,
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => state.admin.client }));
import { PATCH } from "./route";

function request(body: unknown) {
  return new Request("http://example.test/api/onboarding/progress", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  state.user = { id: "user-a", user_metadata: {} };
  state.updateUser.mockReset().mockResolvedValue({ error: null });
  state.admin = fakeSupabase({ users: { data: { id: "user-a", role: "client", company_id: A } }, companies: { data: { id: A, post_pack: "b2b" } } });
});

describe("setup progress", () => {
  it("requires a signed-in user", async () => {
    state.user = null;
    expect((await PATCH(request({ companyId: A, step: "connections" }))).status).toBe(401);
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("uses the real database profile rather than user-editable metadata for company access", async () => {
    state.user!.user_metadata = { role: "admin", company_id: B };
    expect((await PATCH(request({ companyId: B, step: "connections" }))).status).toBe(403);
    expect(state.updateUser).not.toHaveBeenCalled();
    expect(state.admin.calls.filter((call) => call.table === "companies")).toHaveLength(0);
  });

  it("validates JSON and accepts only company and step preferences", async () => {
    for (const body of [null, [], { companyId: A, step: "admin" }, { companyId: A, step: "brand", role: "admin" }]) {
      expect((await PATCH(request(body))).status).toBe(400);
    }
    expect((await PATCH(new Request("http://example.test", { method: "PATCH", body: "{" }))).status).toBe(400);
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("stores only a versioned preference scoped to the authorised company", async () => {
    expect((await PATCH(request({ companyId: A, step: "connections" }))).status).toBe(200);
    expect(state.updateUser).toHaveBeenCalledWith({ data: { workspace_setup: { version: 1, companies: { [A]: { step: "connections" } } } } });
    expect(state.admin.calls).toContainEqual({ table: "companies", method: "eq", args: ["id", A] });
  });

  it("uses the company's real pack and refuses the business voice step for a venue", async () => {
    state.admin = fakeSupabase({ users: { data: { id: "user-a", role: "client", company_id: A } }, companies: { data: { id: A, post_pack: "hospitality" } } });
    expect((await PATCH(request({ companyId: A, step: "voice" }))).status).toBe(400);
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("does not report success when the preference or profile lookup fails", async () => {
    state.updateUser.mockResolvedValue({ error: { message: "Failed" } });
    expect((await PATCH(request({ companyId: A, step: "create" }))).status).toBe(503);
    state.admin = fakeSupabase({ users: { data: null, error: { message: "Unavailable" } } });
    expect((await PATCH(request({ companyId: A, step: "create" }))).status).toBe(503);
  });
});
