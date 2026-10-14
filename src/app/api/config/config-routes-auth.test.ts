import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

/**
 * A client edits their own company's setup (voice, topics, people, sign-offs,
 * posting schedule, strategy) and nobody else's.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state: { user: Record<string, unknown> | null; supabase: ReturnType<typeof fakeSupabase> } = {
  user: null,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  requireAdmin: async () => (state.user?.role === "admin" ? state.user : null),
  getSignedInProfile: async () => state.user,
  createAdminSupabaseClient: async () => state.supabase.client,
}));

import { POST as voicePost } from "./voice/route";
import { PUT as topicPut, DELETE as topicDelete } from "./topic-bank/route";
import { DELETE as signoffDelete } from "./signoffs/route";
import { DELETE as slotDelete } from "./posting-schedule/route";
import { DELETE as personDelete } from "./spokespersons/route";

const send = (method: string, body: Record<string, unknown>) =>
  new Request("http://x/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A };
  state.supabase = fakeSupabase();
});

describe("voice", () => {
  it("lets a member save their own company's voice", async () => {
    state.supabase = fakeSupabase({ company_voice_profiles: { data: { id: "v1" } } });
    const res = await voicePost(send("POST", { companyId: A, voice_description: "Plain and warm" }));
    expect(res.status).toBe(200);
    expect(state.supabase.calls.some((c) => c.table === "company_voice_profiles" && c.method === "insert")).toBe(true);
  });
  it("refuses another company and writes nothing", async () => {
    const res = await voicePost(send("POST", { companyId: B, voice_description: "x" }));
    expect(res.status).toBe(401);
    expect(state.supabase.calls.length).toBe(0);
  });
  it("lets an admin save for any company", async () => {
    state.user = { id: "adm", role: "admin", company_id: null };
    state.supabase = fakeSupabase({ company_voice_profiles: { data: { id: "v1" } } });
    const res = await voicePost(send("POST", { companyId: B, voice_description: "x" }));
    expect(res.status).toBe(200);
  });
});

describe("rows named by id", () => {
  it("refuses to delete another company's topic", async () => {
    state.supabase = fakeSupabase({ topic_bank: { data: { company_id: B } } });
    const res = await topicDelete(send("DELETE", { id: "t-in-b" }));
    expect(res.status).toBe(401);
    expect(state.supabase.calls.some((c) => c.method === "delete")).toBe(false);
  });
  it("deletes the member's own topic, filtered on company_id", async () => {
    state.supabase = fakeSupabase({ topic_bank: { data: { company_id: A } } });
    const res = await topicDelete(send("DELETE", { id: "t-in-a" }));
    expect(res.status).toBe(200);
    expect(state.supabase.calls).toContainEqual(expect.objectContaining({ method: "eq", args: ["company_id", A] }));
  });
  it("refuses to edit another company's topic", async () => {
    state.supabase = fakeSupabase({ topic_bank: { data: { company_id: B } } });
    const res = await topicPut(send("PUT", { id: "t-in-b", title: "x" }));
    expect(res.status).toBe(401);
    expect(state.supabase.calls.some((c) => c.method === "update")).toBe(false);
  });
  it("refuses a sign-off, slot or person that belongs to another company", async () => {
    state.supabase = fakeSupabase({
      company_signoffs: { data: { company_id: B } },
      posting_slots: { data: { company_id: B } },
      company_spokespersons: { data: { company_id: B } },
    });
    expect((await signoffDelete(send("DELETE", { id: "s" }))).status).toBe(401);
    expect((await slotDelete(new Request("http://x/api?id=p", { method: "DELETE" }))).status).toBe(401);
    expect((await personDelete(send("DELETE", { id: "p" }))).status).toBe(401);
    expect(state.supabase.calls.some((c) => c.method === "delete" || c.method === "update")).toBe(false);
  });
});
