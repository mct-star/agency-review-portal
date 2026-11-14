import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state: { user: Record<string, unknown> | null; supabase: ReturnType<typeof fakeSupabase> } = {
  user: null,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  createAdminSupabaseClient: async () => state.supabase.client,
}));

import { GET, PUT } from "./route";

const get = (companyId?: string) =>
  new Request(`http://x/api/config/company-cadence${companyId ? `?companyId=${companyId}` : ""}`);
const put = (body: Record<string, unknown>) =>
  new Request("http://x/api/config/company-cadence", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const calls = (table: string, method: string): RecordedCall[] =>
  state.supabase.calls.filter((c) => c.table === table && c.method === method);

const valid = { mode: "daily", reminderHour: 9, reminderRecipients: ["Maria@Example.com"] };

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A };
  state.supabase = fakeSupabase();
});

describe("GET company-cadence", () => {
  it("needs a companyId", async () => {
    expect((await GET(get())).status).toBe(400);
  });
  it("refuses a caller from another company before reading anything", async () => {
    const res = await GET(get(B));
    expect(res.status).toBe(401);
    expect(state.supabase.calls).toHaveLength(0);
  });
  it("refuses a signed-out caller", async () => {
    state.user = null;
    expect((await GET(get(A))).status).toBe(401);
    expect(state.supabase.calls).toHaveLength(0);
  });
  it("reads only the caller's company", async () => {
    state.supabase = fakeSupabase({
      company_cadence: { data: { company_id: A, mode: "daily", reminder_hour: 9, reminder_recipients: ["m@x.com"] } },
    });
    const res = await GET(get(A));
    expect(res.status).toBe(200);
    expect(calls("company_cadence", "eq").map((c) => c.args)).toContainEqual(["company_id", A]);
    expect((await res.json()).data.mode).toBe("daily");
  });
  it("returns the defaults when no row exists yet", async () => {
    state.supabase = fakeSupabase({ company_cadence: { data: null } });
    const json = await (await GET(get(A))).json();
    expect(json.data).toMatchObject({ mode: "weekly_batch", reminder_hour: 8, reminder_recipients: [] });
  });
});

// The users table answers by the company_id the query filtered on, so a
// route that forgot the filter would see every company's users.
const USERS = [
  { company_id: A, email: "Maria@Example.com" },
  { company_id: A, email: "colleague@example.com" },
  { company_id: B, email: "rival@other.com" },
];
const usersTable = (recorded: RecordedCall[]) => {
  const eq = recorded.find((c) => c.method === "eq" && c.args[0] === "company_id");
  const rows = eq ? USERS.filter((u) => u.company_id === eq.args[1]) : USERS;
  return { data: rows.map((u) => ({ email: u.email })) };
};
const withUsers = (cadence: Record<string, unknown> = { data: { company_id: A } }) =>
  fakeSupabase({ users: usersTable, company_cadence: cadence });

describe("PUT company-cadence", () => {
  it("refuses another company's id outright and writes nothing", async () => {
    const res = await PUT(put({ companyId: B, ...valid }));
    expect(res.status).toBe(401);
    expect(state.supabase.calls).toHaveLength(0);
  });
  it("lets an admin write to any company", async () => {
    state.user = { id: "root", role: "admin", company_id: null };
    state.supabase = fakeSupabase({ company_cadence: { data: { company_id: B } } });
    expect((await PUT(put({ companyId: B, ...valid }))).status).toBe(200);
  });
  it("saves validated, lower-cased values keyed on the caller's company", async () => {
    state.supabase = withUsers();
    const res = await PUT(put({ companyId: A, ...valid }));
    expect(res.status).toBe(200);
    const [upsert] = calls("company_cadence", "upsert");
    expect(upsert.args[0]).toEqual({
      company_id: A,
      mode: "daily",
      reminder_hour: 9,
      reminder_recipients: ["maria@example.com"],
    });
    expect(upsert.args[1]).toEqual({ onConflict: "company_id" });
  });
  it("refuses an invalid hour without writing", async () => {
    const res = await PUT(put({ companyId: A, ...valid, reminderHour: 24 }));
    expect(res.status).toBe(400);
    expect(calls("company_cadence", "upsert")).toHaveLength(0);
  });
  it("refuses a malformed email without writing", async () => {
    const res = await PUT(put({ companyId: A, ...valid, reminderRecipients: ["not-an-email"] }));
    expect(res.status).toBe(400);
    expect(calls("company_cadence", "upsert")).toHaveLength(0);
  });
  it("ignores a company_id smuggled into the values", async () => {
    state.supabase = withUsers();
    await PUT(put({ companyId: A, ...valid, company_id: B }));
    expect((calls("company_cadence", "upsert")[0].args[0] as { company_id: string }).company_id).toBe(A);
  });

  describe("recipients must be users of the company", () => {
    it("refuses a client adding an outside address, names it, and writes nothing", async () => {
      state.supabase = withUsers();
      const res = await PUT(put({ companyId: A, ...valid, reminderRecipients: ["maria@example.com", "Someone@Gmail.com"] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("someone@gmail.com");
      expect(calls("company_cadence", "upsert")).toHaveLength(0);
      expect(calls("users", "eq").map((c) => c.args)).toContainEqual(["company_id", A]);
    });

    it("lets a client add a colleague in the same company", async () => {
      state.supabase = withUsers();
      const res = await PUT(put({ companyId: A, ...valid, reminderRecipients: ["maria@example.com", "Colleague@Example.com"] }));
      expect(res.status).toBe(200);
      expect((calls("company_cadence", "upsert")[0].args[0] as { reminder_recipients: string[] }).reminder_recipients).toEqual([
        "maria@example.com",
        "colleague@example.com",
      ]);
    });

    it("refuses the address of a user in another company", async () => {
      state.supabase = withUsers();
      const res = await PUT(put({ companyId: A, ...valid, reminderRecipients: ["rival@other.com"] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("rival@other.com");
      expect(calls("company_cadence", "upsert")).toHaveLength(0);
    });

    it("lets an admin add an outside address without a users lookup", async () => {
      state.user = { id: "root", role: "admin", company_id: null };
      state.supabase = withUsers();
      const res = await PUT(put({ companyId: A, ...valid, reminderRecipients: ["someone@gmail.com"] }));
      expect(res.status).toBe(200);
      expect(calls("users", "select")).toHaveLength(0);
      expect(calls("company_cadence", "upsert")).toHaveLength(1);
    });

    it("needs no lookup to clear the list", async () => {
      state.supabase = withUsers();
      expect((await PUT(put({ companyId: A, ...valid, reminderRecipients: [] }))).status).toBe(200);
      expect(calls("users", "select")).toHaveLength(0);
    });
  });
});
