import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const state: { user: Record<string, unknown> | null; supabase: ReturnType<typeof fakeSupabase> } = {
  user: null,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: async () => (state.user?.role === "admin" ? state.user : null),
  createAdminSupabaseClient: async () => state.supabase.client,
}));

import { PATCH } from "./[id]/route";

const patch = (id: string, body: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/users/" + id, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

/** users table: the target lookup, the admin list, and the update each get their own answer. */
function usersTable(opts: { targetRole: string; admins: { id: string }[] }) {
  return (own: RecordedCall[]) => {
    if (own.some((c) => c.method === "update")) {
      return { data: { id: OTHER, role: "client", can_publish: true } };
    }
    if (own.some((c) => c.method === "eq" && c.args[0] === "role")) {
      return { data: opts.admins };
    }
    return { data: { id: OTHER, role: opts.targetRole } };
  };
}

beforeEach(() => {
  state.user = { id: ADMIN, role: "admin", company_id: null };
  state.supabase = fakeSupabase({ users: usersTable({ targetRole: "client", admins: [{ id: ADMIN }] }) });
});

describe("PATCH /api/users/[id]", () => {
  it("refuses a client with 401", async () => {
    state.user = { id: "c", role: "client", company_id: "x" };
    const res = await patch(OTHER, { can_publish: true });
    expect(res.status).toBe(401);
    expect(state.supabase.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("lets an admin set can_publish", async () => {
    const res = await patch(OTHER, { can_publish: true });
    expect(res.status).toBe(200);
    const update = state.supabase.calls.find((c) => c.table === "users" && c.method === "update");
    expect(update?.args[0]).toEqual({ can_publish: true });
  });

  it("rejects an invalid role with 400", async () => {
    const res = await patch(OTHER, { role: "superuser" });
    expect(res.status).toBe(400);
  });

  it("refuses to demote the only admin with 409", async () => {
    state.supabase = fakeSupabase({ users: usersTable({ targetRole: "admin", admins: [{ id: OTHER }] }) });
    const res = await patch(OTHER, { role: "client" });
    expect(res.status).toBe(409);
    expect(state.supabase.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("allows a demotion when another admin remains", async () => {
    state.supabase = fakeSupabase({ users: usersTable({ targetRole: "admin", admins: [{ id: OTHER }, { id: ADMIN }] }) });
    const res = await patch(OTHER, { role: "client" });
    expect(res.status).toBe(200);
  });
});
