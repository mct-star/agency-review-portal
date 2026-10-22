import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const state: { profile: unknown; supabase: ReturnType<typeof fakeSupabase> } = { profile: null, supabase: fakeSupabase() };
const planWeek = vi.fn(async () => ({ created: [], notes: ["note"] }));

vi.mock("@/lib/supabase/admin", () => ({ getSignedInProfile: async () => state.profile, createAdminSupabaseClient: async () => state.supabase.client }));
vi.mock("@/lib/hospitality/week-interview", () => ({ planWeekFromTranscript: (...a: unknown[]) => (planWeek as (...x: unknown[]) => unknown)(...a), realInterviewDeps: () => ({}) }));
vi.mock("@/lib/providers/transcription/transcribe", () => ({ transcribeAudio: async () => ({ text: "Wine tasting Wednesday at seven, fish and chips on Friday", provider: "gemini" }) }));

import { POST } from "./route";

const company = { id: A, name: "Lakeside", industry: null, description: null, plan: "pro", trial_plan: null, trial_expires_at: null, post_pack: "hospitality", hospitality_settings: {}, timezone: "Europe/London" };
const json = (b: Record<string, unknown>) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: A, ...b }) });

beforeEach(() => {
  planWeek.mockClear();
  state.profile = { id: "u", role: "client", company_id: A };
  state.supabase = fakeSupabase({ companies: { data: company }, content_pieces: { count: 0 } });
});

describe("POST /api/hospitality/week-plan", () => {
  it("plans the week from a typed transcript", async () => {
    const res = await POST(json({ transcript: "Wine tasting Wednesday at seven and fish and chips on Friday." }));
    expect(res.status).toBe(200);
    expect(planWeek).toHaveBeenCalledOnce();
    expect(await res.json()).toMatchObject({ notes: ["note"] });
  });
  it("transcribes a recording first", async () => {
    const form = new FormData();
    form.set("companyId", A);
    form.set("audio", new Blob([new Uint8Array(2000)], { type: "audio/webm" }), "week.webm");
    const res = await POST(new Request("http://x", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect((planWeek.mock.calls[0] as unknown as [{ transcript: string }])[0].transcript).toMatch(/Wine tasting Wednesday/);
  });
  it("refuses another company, a signed-out caller, and a non-hospitality company", async () => {
    expect((await POST(json({ companyId: B, transcript: "x".repeat(40) }))).status).toBe(403);
    state.profile = null;
    expect((await POST(json({ transcript: "x".repeat(40) }))).status).toBe(401);
    state.profile = { id: "u", role: "client", company_id: A };
    state.supabase = fakeSupabase({ companies: { data: { ...company, post_pack: "b2b" } } });
    expect((await POST(json({ transcript: "x".repeat(40) }))).status).toBe(400);
    expect(planWeek).not.toHaveBeenCalled();
  });
  it("asks for more when there is next to nothing to go on", async () => {
    expect((await POST(json({ transcript: "hi" }))).status).toBe(400);
  });
  it("refuses a recording that is too long", async () => {
    const form = new FormData();
    form.set("companyId", A);
    form.set("audio", new Blob([new Uint8Array(4_100_000)], { type: "audio/webm" }), "week.webm");
    expect((await POST(new Request("http://x", { method: "POST", body: form }))).status).toBe(413);
  });
  it("stops at the monthly post limit", async () => {
    state.supabase = fakeSupabase({ companies: { data: { ...company, plan: "starter" } }, content_pieces: { count: 20 } });
    expect((await POST(json({ transcript: "x".repeat(40) }))).status).toBe(402);
  });
});
