import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const state: { admin: boolean; supabase: ReturnType<typeof fakeSupabase> } = {
  admin: true,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: async () => (state.admin ? { id: "u1", role: "admin" } : null),
  createAdminSupabaseClient: async () => state.supabase.client,
}));

import { DELETE, POST } from "./route";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function req(method: string, body: unknown) {
  return new Request("http://localhost/api/config/social-accounts", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const writes = () =>
  state.supabase.calls.filter((c) => ["delete", "upsert", "update", "insert"].includes(c.method));

describe("/api/config/social-accounts and LinkedIn pages", () => {
  beforeEach(() => {
    state.admin = true;
  });

  it("refuses to create or rewrite a LinkedIn page row", async () => {
    state.supabase = fakeSupabase();
    const res = await POST(req("POST", { companyId: COMPANY, platform: "linkedin_company", accountId: "92847021" }));
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });

  it("still saves other platforms", async () => {
    state.supabase = fakeSupabase({ company_social_accounts: { data: { id: "x", platform: "instagram" } } });
    const res = await POST(req("POST", { companyId: COMPANY, platform: "instagram", accountId: "ig" }));
    expect(res.status).toBe(200);
    expect(writes().map((c) => c.method)).toEqual(["upsert"]);
  });

  it("refuses to delete a LinkedIn page row", async () => {
    state.supabase = fakeSupabase({ company_social_accounts: { data: { id: "p1", platform: "linkedin_company" } } });
    const res = await DELETE(req("DELETE", { id: "p1" }));
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });

  it("deletes other rows, and the delete itself excludes page rows", async () => {
    state.supabase = fakeSupabase({ company_social_accounts: { data: { id: "s1", platform: "instagram" } } });
    const res = await DELETE(req("DELETE", { id: "s1" }));
    expect(res.status).toBe(200);
    expect(writes().map((c) => c.method)).toEqual(["delete"]);
    expect(state.supabase.calls).toContainEqual(
      expect.objectContaining({ method: "neq", args: ["platform", "linkedin_company"] }),
    );
  });

  it("returns 404 for an unknown id and deletes nothing", async () => {
    state.supabase = fakeSupabase({ company_social_accounts: { data: null } });
    const res = await DELETE(req("DELETE", { id: "missing" }));
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it("still requires an admin", async () => {
    state.admin = false;
    state.supabase = fakeSupabase();
    expect((await DELETE(req("DELETE", { id: "p1" }))).status).toBe(401);
    expect((await POST(req("POST", { companyId: COMPANY, platform: "linkedin_company" }))).status).toBe(401);
  });
});
