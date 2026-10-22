import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const EM = String.fromCharCode(0x2014);
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PIECE = "33333333-3333-4333-8333-333333333333";

const state: { profile: unknown; supabase: ReturnType<typeof fakeSupabase> } = { profile: null, supabase: fakeSupabase() };
vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => state.profile,
  createAdminSupabaseClient: async () => state.supabase.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/hospitality/generate", () => ({
  generateHospitalityPost: async () => ({ body: "Sea bass, £22.\n\n#lunch", caption: "Sea bass, £22.", hashtags: ["#lunch"], altText: "Fish", warnings: [], provider: "gemini" }),
}));

import { POST as quick } from "./quick/route";
import { PATCH as editPiece } from "./pieces/[id]/route";
import { POST as decide } from "./pieces/[id]/decision/route";
import { PUT as putSettings } from "@/app/api/company/hospitality/route";

const member = (c: string) => ({ id: "u1", role: "client", company_id: c });
const company = { id: A, name: "Lakeside", industry: null, description: null, plan: "pro", trial_plan: null, trial_expires_at: null, post_pack: "hospitality", hospitality_settings: {}, timezone: "Europe/London" };

const quickReq = (over: Record<string, unknown> = {}) =>
  new Request("http://x", { method: "POST", body: JSON.stringify({ companyId: A, postTypeSlug: "special_of_the_day", brief: "Sea bass £22", ...over }) });

beforeEach(() => {
  state.profile = member(A);
  state.supabase = fakeSupabase({
    companies: { data: company },
    photo_inventory: { data: [] },
    weeks: { data: { id: "w1", week_number: 42, year: 2026, date_start: "2026-10-12" } },
    content_pieces: { data: { id: PIECE, company_id: A, week_id: "w1", approval_status: "pending", auto_source: "quick_post", post_type: "event" }, count: 0 },
    content_images: { data: [] },
  });
});

describe("POST /api/hospitality/quick", () => {
  it("writes a draft that waits for approval", async () => {
    const res = await quick(quickReq());
    expect(res.status).toBe(200);
    const insert = state.supabase.calls.find((c) => c.table === "content_pieces" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ approval_status: "pending", auto_source: "quick_post", post_type: "special_of_the_day", company_id: A });
    expect((await res.json()).imageNote).toMatch(/No photo in the library suited/);
  });
  it("refuses another company's id", async () => {
    expect((await quick(quickReq({ companyId: B }))).status).toBe(403);
  });
  it("refuses a signed-out caller", async () => {
    state.profile = null;
    expect((await quick(quickReq())).status).toBe(401);
  });
  it("refuses the weather post (it is drafted for you) and an empty brief", async () => {
    expect((await quick(quickReq({ postTypeSlug: "weather_of_the_day" }))).status).toBe(400);
    expect((await quick(quickReq({ brief: "  " }))).status).toBe(400);
  });
  it("refuses a post type outside the company's pack", async () => {
    state.supabase = fakeSupabase({ companies: { data: { ...company, post_pack: "b2b" } } });
    expect((await quick(quickReq())).status).toBe(400);
  });
  it("stops at the monthly post limit", async () => {
    state.supabase = fakeSupabase({ companies: { data: { ...company, plan: "starter" } }, content_pieces: { count: 20 } });
    expect((await quick(quickReq())).status).toBe(402);
  });
});

describe("pieces: edit and decide", () => {
  const ctx = { params: Promise.resolve({ id: PIECE }) };
  const json = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });

  it("approves a draft for a member of its company", async () => {
    const res = await decide(json({ decision: "approve" }), ctx);
    expect(res.status).toBe(200);
    expect(state.supabase.calls.find((c) => c.method === "update")?.args[0]).toMatchObject({ approval_status: "approved" });
  });
  it("answers 404 to another company's member", async () => {
    state.profile = member(B);
    expect((await decide(json({ decision: "approve" }), ctx)).status).toBe(404);
    expect((await editPiece(new Request("http://x", { method: "PATCH", body: JSON.stringify({ body: "x" }) }), ctx)).status).toBe(404);
  });
  it("will not discard or edit an approved post", async () => {
    state.supabase = fakeSupabase({ content_pieces: { data: { id: PIECE, company_id: A, week_id: "w1", approval_status: "approved", auto_source: null, post_type: "event" } } });
    expect((await decide(json({ decision: "discard" }), ctx)).status).toBe(409);
    expect((await editPiece(new Request("http://x", { method: "PATCH", body: JSON.stringify({ body: "x" }) }), ctx)).status).toBe(409);
  });
  it("strips long dashes from an edit", async () => {
    await editPiece(new Request("http://x", { method: "PATCH", body: JSON.stringify({ body: "Open late " + EM + " come in" }) }), ctx);
    const update = state.supabase.calls.find((c) => c.method === "update")?.args[0] as { markdown_body: string };
    expect(update.markdown_body).toBe("Open late, come in");
  });
  it("rejects an unknown decision", async () => {
    expect((await decide(json({ decision: "publish" }), ctx)).status).toBe(400);
  });
});

describe("PUT /api/company/hospitality", () => {
  const put = (b: Record<string, unknown>) => new Request("http://x", { method: "PUT", body: JSON.stringify({ companyId: A, ...b }) });

  it("refuses a member who tries to change the pack", async () => {
    // Only AGENCY sets the pack: a member could otherwise turn a venue into a LinkedIn account with one tap.
    const res = await putSettings(put({ post_pack: "b2b" }));
    expect(res.status).toBe(403);
    expect(state.supabase.calls.find((c) => c.method === "update")).toBeUndefined();
  });
  it("lets an admin change the pack and defaults the networks", async () => {
    state.profile = { id: "a1", role: "admin", company_id: null };
    state.supabase = fakeSupabase({ companies: { data: { social_networks: [], hospitality_settings: {} } } });
    const res = await putSettings(put({ post_pack: "hospitality" }));
    expect(res.status).toBe(200);
    expect(state.supabase.calls.find((c) => c.method === "update")?.args[0]).toMatchObject({ post_pack: "hospitality", social_networks: ["facebook", "instagram"] });
  });
  it("cannot be used to change the plan", async () => {
    expect((await putSettings(put({ plan: "agency" }))).status).toBe(400);
    const res = await putSettings(put({ hospitality_settings: { venue_notes: "A bar by the lake." }, plan: "agency" }));
    const update = state.supabase.calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown> | undefined;
    expect(res.status).toBe(200);
    expect(update && "plan" in update).toBe(false);
  });
  it("refuses another company", async () => {
    expect((await putSettings(put({ companyId: B, post_pack: "hospitality" }))).status).toBe(403);
  });
});
