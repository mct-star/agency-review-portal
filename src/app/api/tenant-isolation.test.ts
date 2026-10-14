import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

/**
 * Phase 0 of the October 2026 audit: every read and write is scoped to the
 * caller's company, publishing needs the publish right, and the crons fail
 * closed. Two companies, A and B; the caller belongs to A.
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
vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => state.user,
  getUser: async () => (state.user ? { id: state.user.id, email: "a@example.com" } : null),
  createServerSupabaseClient: async () => state.supabase.client,
}));
vi.mock("@/lib/providers", () => ({ resolveProvider: async () => ({ provider: "anthropic_claude", credentials: { api_key: "k" }, settings: {} }) }));
vi.mock("@/lib/providers/content-adaptation/claude-util", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  callClaude: async () => JSON.stringify({ overallScore: 100, riskLevel: "low", issues: [], passedChecks: [], summary: "fine" }),
}));

import { POST as regulatory } from "./review/regulatory/route";
import { POST as overlay } from "./generate/overlay/route";
import { GET as jobStatus } from "./generate/status/[jobId]/route";
import { POST as linkedinDirect } from "./publish/linkedin-direct/route";
import { POST as bluesky } from "./publish/bluesky/route";
import { GET as trialEmails } from "./cron/trial-emails/route";
import { POST as voice } from "./generate/transcribe/voice/route";

const post = (body: Record<string, unknown>) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const eqCalls = (calls: RecordedCall[], table: string) =>
  calls.filter((c) => c.table === table && c.method === "eq").map((c) => c.args);

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A, can_publish: false };
  state.supabase = fakeSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
});

describe("regulatory review", () => {
  it("reads pieces only from the authorised company, whatever pieceIds say", async () => {
    state.supabase = fakeSupabase({ content_pieces: { data: [] } });
    const res = await regulatory(post({ companyId: A, pieceIds: ["p-in-b"] }));
    expect(res.status).toBe(404);
    expect(eqCalls(state.supabase.calls, "content_pieces")).toContainEqual(["company_id", A]);
  });
  it("refuses a caller from another company outright", async () => {
    const res = await regulatory(post({ companyId: B, pieceIds: ["p"] }));
    expect(res.status).toBe(401);
  });
});

describe("overlay", () => {
  it("refuses to brand a piece that is not the company's", async () => {
    state.supabase = fakeSupabase({ content_pieces: { data: null } });
    const res = await overlay(post({ imageUrl: "https://abc.supabase.co/storage/v1/object/public/media/x.png", companyId: A, contentPieceId: "p-in-b" }));
    expect(res.status).toBe(403);
    expect(eqCalls(state.supabase.calls, "content_pieces")).toContainEqual(["company_id", A]);
  });
});

describe("job status", () => {
  const job = { id: "j", company_id: B, job_type: "x", provider: "claude", status: "completed", progress: 100 };
  it("hides another company's job from a client", async () => {
    state.supabase = fakeSupabase({ content_generation_jobs: { data: job } });
    const res = await jobStatus(new Request("http://x/api"), { params: Promise.resolve({ jobId: "j" }) });
    expect(res.status).toBe(404);
  });
  it("shows it to an admin", async () => {
    state.user = { id: "adm", role: "admin", company_id: null };
    state.supabase = fakeSupabase({ content_generation_jobs: { data: job } });
    const res = await jobStatus(new Request("http://x/api"), { params: Promise.resolve({ jobId: "j" }) });
    expect(res.status).toBe(200);
  });
  it("needs a sign-in", async () => {
    state.user = null;
    const res = await jobStatus(new Request("http://x/api"), { params: Promise.resolve({ jobId: "j" }) });
    expect(res.status).toBe(401);
  });
});

describe("direct publishing", () => {
  it("needs the publish right", async () => {
    expect((await linkedinDirect(post({ companyId: A, text: "hi" }))).status).toBe(403);
    expect((await bluesky(post({ companyId: A, text: "hi" }))).status).toBe(403);
  });
  it("fetches images only from our own storage", async () => {
    state.user = { id: "u-a", role: "client", company_id: A, can_publish: true };
    const res = await linkedinDirect(post({ companyId: A, text: "hi", imageUrl: "https://evil.example/x.png" }));
    expect(res.status).toBe(400);
    const res2 = await bluesky(post({ companyId: A, text: "hi", imageUrl: "https://evil.example/x.png" }));
    expect(res2.status).toBe(400);
  });
});

describe("crons and open routes", () => {
  it("trial emails fail closed without a secret and refuse a wrong one", async () => {
    delete process.env.CRON_SECRET;
    expect((await trialEmails(new Request("http://x/api/cron/trial-emails"))).status).toBe(503);
    process.env.CRON_SECRET = "s";
    expect((await trialEmails(new Request("http://x/api/cron/trial-emails", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    delete process.env.CRON_SECRET;
  });
  it("voice transcription needs a signed-in person", async () => {
    state.user = null;
    const res = await voice(new Request("http://x/api", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(401);
  });
});
