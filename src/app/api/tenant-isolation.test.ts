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
const connectBluesky = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, handle: "h.bsky.social", did: "did:plc:x" })));
vi.mock("@/lib/bluesky/connect", () => ({ connectBlueskyAccount: connectBluesky }));
const linkedinExchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/linkedin/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), exchangeCodeForTokens: linkedinExchange }));
vi.mock("@/lib/providers", () => ({ resolveProvider: async () => ({ provider: "anthropic_claude", credentials: { api_key: "k" }, settings: {} }) }));
vi.mock("@/lib/providers/content-adaptation/claude-util", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  callClaude: async () => JSON.stringify({ overallScore: 100, riskLevel: "low", issues: [], passedChecks: [], summary: "fine" }),
}));

import { POST as regulatory } from "./review/regulatory/route";
import { POST as overlay } from "./generate/overlay/route";
import { GET as jobStatus } from "./generate/status/[jobId]/route";
import { POST as linkedinDirect, DELETE as linkedinDisconnect } from "./publish/linkedin-direct/route";
import { DELETE as socialDisconnect } from "./publish/social/route";
import { GET as linkedinStart } from "./auth/linkedin/route";
import { GET as linkedinCallback } from "./auth/linkedin/callback/route";
import { GET as blueskyStart, POST as blueskyConnect } from "./auth/bluesky/route";
import { POST as blueskyAppPassword } from "./config/social-accounts/bluesky/route";
import { signOAuthState } from "@/lib/linkedin/oauth-state";
import { POST as bluesky } from "./publish/bluesky/route";
import { GET as trialEmails } from "./cron/trial-emails/route";
import { POST as voice } from "./generate/transcribe/voice/route";
import { GET as listAssets } from "./assets/route";
import { GET as listVariants, PUT as updateVariant } from "./variants/route";

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

/**
 * Channel connections (LinkedIn and Bluesky): an admin may connect any
 * company; a client only their own, and only with can_publish. A client in A
 * can never start, complete, replace or disconnect a channel for B.
 */
describe("channel connections", () => {
  const del = (body: Record<string, unknown>) =>
    new Request("http://x/api", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const get = (path: string) => new Request(`https://portal.example${path}`);
  const writes = () => state.supabase.calls.filter((c) => c.table === "company_social_accounts" && ["update", "upsert", "insert", "delete"].includes(c.method));
  const asClient = (company: string, canPublish: boolean) => { state.user = { id: "u-a", role: "client", company_id: company, can_publish: canPublish }; };

  beforeEach(() => {
    process.env.LINKEDIN_CLIENT_ID = "id";
    process.env.LINKEDIN_CLIENT_SECRET = "secret";
    connectBluesky.mockClear();
    linkedinExchange.mockReset();
    asClient(A, true);
    state.supabase = fakeSupabase({ company_social_accounts: { data: { id: "acc-1", platform: "bluesky" } } });
  });

  it("starts LinkedIn for a client's own company with a state bound to the user and the company", async () => {
    const res = await linkedinStart(get(`/api/auth/linkedin?companyId=${A}`));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.hostname).toBe("www.linkedin.com");
    const { verifyOAuthState } = await import("@/lib/linkedin/oauth-state");
    expect(await verifyOAuthState(location.searchParams.get("state"), "secret")).toMatchObject({ companyId: A, userId: "u-a" });
  });
  it("refuses a client starting LinkedIn for another company with 403", async () => {
    const res = await linkedinStart(get(`/api/auth/linkedin?companyId=${B}`));
    expect(res.status).toBe(403);
    expect(state.supabase.calls.filter((c) => c.table === "companies")).toHaveLength(0);
  });
  it("refuses a client without can_publish on every channel route, for their own company too", async () => {
    asClient(A, false);
    expect((await linkedinStart(get(`/api/auth/linkedin?companyId=${A}`))).status).toBe(403);
    expect((await blueskyStart(get(`/api/auth/bluesky?companyId=${A}&handle=h.bsky.social`))).status).toBe(403);
    expect((await blueskyConnect(post({ companyId: A, handle: "h.bsky.social", appPassword: "x" }))).status).toBe(403);
    expect((await blueskyAppPassword(post({ companyId: A, handle: "h.bsky.social", appPassword: "x" }))).status).toBe(403);
    expect((await linkedinDisconnect(del({ companyId: A, socialAccountId: "acc-1" }))).status).toBe(403);
    expect((await socialDisconnect(del({ companyId: A, socialAccountId: "acc-1" }))).status).toBe(403);
    expect(connectBluesky).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
  it("refuses a client completing a LinkedIn flow for another company, with no token exchange or write", async () => {
    const forged = await signOAuthState({ companyId: B, userId: "u-a", returnTo: "setup" }, "secret");
    const res = await linkedinCallback(get(`/api/auth/linkedin/callback?code=abc&state=${encodeURIComponent(forged)}`));
    expect(res.headers.get("location")).toContain("linkedin_error=not_authorised");
    expect(linkedinExchange).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
  it("refuses a client starting or replacing Bluesky for another company", async () => {
    expect((await blueskyStart(get(`/api/auth/bluesky?companyId=${B}&handle=h.bsky.social`))).status).toBe(403);
    expect((await blueskyConnect(post({ companyId: B, handle: "h.bsky.social", appPassword: "x" }))).status).toBe(403);
    expect((await blueskyAppPassword(post({ companyId: B, handle: "h.bsky.social", appPassword: "x" }))).status).toBe(403);
    expect(connectBluesky).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
  it("lets a client replace Bluesky for their own company", async () => {
    const res = await blueskyAppPassword(post({ companyId: A, handle: "h.bsky.social", appPassword: "x" }));
    expect(res.status).toBe(200);
    expect(connectBluesky).toHaveBeenCalledWith(A, "h.bsky.social", "x");
  });
  it("refuses a client disconnecting another company's LinkedIn or Bluesky account", async () => {
    expect((await linkedinDisconnect(del({ companyId: B, socialAccountId: "acc-1" }))).status).toBe(403);
    expect((await socialDisconnect(del({ companyId: B, socialAccountId: "acc-1" }))).status).toBe(403);
    expect(writes()).toHaveLength(0);
  });
  it("scopes a client's own disconnect to their company, whatever account id is named", async () => {
    expect((await socialDisconnect(del({ companyId: A, socialAccountId: "acc-of-b" }))).status).toBe(200);
    expect((await linkedinDisconnect(del({ companyId: A, socialAccountId: "acc-of-b" }))).status).toBe(200);
    const eqs = eqCalls(state.supabase.calls, "company_social_accounts");
    expect(eqs).toContainEqual(["company_id", A]);
    expect(eqs.some((args) => args[0] === "company_id" && args[1] === B)).toBe(false);
    expect(writes().length).toBeGreaterThan(0);
  });
  it("refuses a hospitality venue's client on the connect routes", async () => {
    state.supabase = fakeSupabase({ companies: { data: { post_pack: "hospitality" } } });
    expect((await linkedinStart(get(`/api/auth/linkedin?companyId=${A}`))).status).toBe(403);
    expect((await blueskyStart(get(`/api/auth/bluesky?companyId=${A}&handle=h.bsky.social`))).status).toBe(403);
    expect((await blueskyAppPassword(post({ companyId: A, handle: "h.bsky.social", appPassword: "x" }))).status).toBe(403);
  });
  it("needs a sign-in", async () => {
    state.user = null;
    expect((await linkedinStart(get(`/api/auth/linkedin?companyId=${A}`))).status).toBe(401);
    expect((await socialDisconnect(del({ companyId: A, socialAccountId: "acc-1" }))).status).toBe(401);
  });
  it("keeps working for an admin on any company", async () => {
    state.user = { id: "admin-1", role: "admin", company_id: null, can_publish: true };
    expect((await linkedinStart(get(`/api/auth/linkedin?companyId=${B}`))).status).toBe(307);
    expect((await blueskyAppPassword(post({ companyId: B, handle: "h.bsky.social", appPassword: "x" }))).status).toBe(200);
    expect((await linkedinDisconnect(del({ companyId: B, socialAccountId: "acc-1" }))).status).toBe(200);
    expect((await socialDisconnect(del({ companyId: B, socialAccountId: "acc-1" }))).status).toBe(200);
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

/**
 * GET /api/assets read every asset of a piece for anyone holding its id
 * (closed 15 Nov 2026). It now needs a sign-in and the piece's company; an
 * unknown piece and another company's piece answer the same 404.
 */
describe("piece assets", () => {
  const get = (pieceId: string) => new Request(`http://x/api/assets?contentPieceId=${pieceId}`);
  const assetRows = [{ id: "as-1", content_piece_id: "p", asset_type: "blog_article", sort_order: 0 }];
  const withPiece = (companyId: string | null) =>
    fakeSupabase({
      content_pieces: { data: companyId ? { id: "p", company_id: companyId } : null },
      content_assets: { data: assetRows },
    });
  const assetReads = () => state.supabase.calls.filter((c) => c.table === "content_assets");

  it("needs a sign-in", async () => {
    state.user = null;
    state.supabase = withPiece(A);
    expect((await listAssets(get("p"))).status).toBe(401);
    expect(assetReads()).toEqual([]);
  });
  it("refuses a member of another company, and reads no assets", async () => {
    state.supabase = withPiece(B);
    const res = await listAssets(get("p"));
    expect(res.status).toBe(404);
    expect(assetReads()).toEqual([]);
  });
  it("answers an unknown piece exactly as it answers another company's", async () => {
    state.supabase = withPiece(null);
    const unknown = await listAssets(get("nope"));
    state.supabase = withPiece(B);
    const other = await listAssets(get("p"));
    expect(unknown.status).toBe(other.status);
    expect(await unknown.json()).toEqual(await other.json());
  });
  it("serves a member of the owning company", async () => {
    state.supabase = withPiece(A);
    const res = await listAssets(get("p"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(assetRows);
    expect(eqCalls(state.supabase.calls, "content_assets")).toContainEqual(["content_piece_id", "p"]);
  });
  it("serves an admin, whatever the company", async () => {
    state.user = { id: "adm", role: "admin", company_id: null };
    state.supabase = withPiece(B);
    const res = await listAssets(get("p"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(assetRows);
  });
});

/**
 * Platform variants: reading needs access to the piece's company; updating
 * needs access to the company of the variant's piece. Unknown and another
 * company's both answer 404, and nothing is read or written for them.
 */
describe("piece variants", () => {
  const get = (pieceId: string) => new Request(`http://x/api/variants?contentPieceId=${pieceId}`);
  const put = (body: Record<string, unknown>) =>
    new Request("http://x/api/variants", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const variantRows = [{ id: "v-1", content_piece_id: "p", platform: "linkedin" }];
  const variantReads = () => state.supabase.calls.filter((c) => c.table === "platform_variants");
  const variantUpdates = () => state.supabase.calls.filter((c) => c.table === "platform_variants" && c.method === "update");
  /** The piece belongs to companyId (null: no such piece). The variant exists unless variant is false. */
  const withPiece = (companyId: string | null, variant = true) =>
    fakeSupabase({
      content_pieces: { data: companyId ? { id: "p", company_id: companyId } : null },
      platform_variants: (own) =>
        own.some((c) => c.method === "update")
          ? { data: { ...variantRows[0], approval_status: "approved" } }
          : own.some((c) => c.method === "maybeSingle")
            ? { data: variant ? { id: "v-1", content_piece_id: "p" } : null }
            : { data: variantRows },
    });

  describe("GET", () => {
    it("needs a sign-in, and reads no variants", async () => {
      state.user = null;
      state.supabase = withPiece(A);
      expect((await listVariants(get("p"))).status).toBe(401);
      expect(variantReads()).toEqual([]);
    });
    it("refuses a member of another company, and reads no variants", async () => {
      state.supabase = withPiece(B);
      const res = await listVariants(get("p"));
      expect(res.status).toBe(404);
      expect(variantReads()).toEqual([]);
    });
    it("answers an unknown piece exactly as it answers another company's", async () => {
      state.supabase = withPiece(null);
      const unknown = await listVariants(get("nope"));
      state.supabase = withPiece(B);
      const other = await listVariants(get("p"));
      expect(unknown.status).toBe(other.status);
      expect(await unknown.json()).toEqual(await other.json());
    });
    it("serves a member of the owning company", async () => {
      state.supabase = withPiece(A);
      const res = await listVariants(get("p"));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual(variantRows);
      expect(eqCalls(state.supabase.calls, "platform_variants")).toContainEqual(["content_piece_id", "p"]);
    });
    it("serves an admin, whatever the company", async () => {
      state.user = { id: "adm", role: "admin", company_id: null };
      state.supabase = withPiece(B);
      const res = await listVariants(get("p"));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual(variantRows);
    });
  });

  describe("PUT", () => {
    it("needs a sign-in, and updates nothing", async () => {
      state.user = null;
      state.supabase = withPiece(A);
      expect((await updateVariant(put({ id: "v-1", approvalStatus: "approved" }))).status).toBe(401);
      expect(variantReads()).toEqual([]);
    });
    it("refuses another company's variant, and updates nothing", async () => {
      state.supabase = withPiece(B);
      const res = await updateVariant(put({ id: "v-1", approvalStatus: "approved" }));
      expect(res.status).toBe(404);
      expect(variantUpdates()).toEqual([]);
      expect(eqCalls(state.supabase.calls, "content_pieces")).toContainEqual(["id", "p"]);
    });
    it("answers an unknown variant exactly as it answers another company's", async () => {
      state.supabase = withPiece(A, false);
      const unknown = await updateVariant(put({ id: "nope", approvalStatus: "approved" }));
      expect(variantUpdates()).toEqual([]);
      state.supabase = withPiece(B);
      const other = await updateVariant(put({ id: "v-1", approvalStatus: "approved" }));
      expect(unknown.status).toBe(404);
      expect(unknown.status).toBe(other.status);
      expect(await unknown.json()).toEqual(await other.json());
    });
    it("lets a member of the owning company set the approval status", async () => {
      state.supabase = withPiece(A);
      const res = await updateVariant(put({ id: "v-1", approvalStatus: "approved" }));
      expect(res.status).toBe(200);
      expect(variantUpdates()).toEqual([{ table: "platform_variants", method: "update", args: [{ approval_status: "approved" }] }]);
      expect(eqCalls(state.supabase.calls, "content_pieces")).toContainEqual(["id", "p"]);
      const afterUpdate = state.supabase.calls.slice(state.supabase.calls.findIndex((c) => c.method === "update"));
      expect(afterUpdate).toContainEqual({ table: "platform_variants", method: "eq", args: ["id", "v-1"] });
    });
    it("refuses a member of the owning company anything but the approval status", async () => {
      state.supabase = withPiece(A);
      const res = await updateVariant(put({ id: "v-1", isSelected: true }));
      expect(res.status).toBe(403);
      expect(variantUpdates()).toEqual([]);
    });
    it("lets an admin update any company's variant", async () => {
      state.user = { id: "adm", role: "admin", company_id: null };
      state.supabase = withPiece(B);
      const res = await updateVariant(put({ id: "v-1", isSelected: true }));
      expect(res.status).toBe(200);
      expect(variantUpdates()).toEqual([{ table: "platform_variants", method: "update", args: [{ is_selected: true }] }]);
    });
  });
});
