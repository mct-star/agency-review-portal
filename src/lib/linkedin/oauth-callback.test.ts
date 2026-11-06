import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { signOAuthState } from "./oauth-state";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  supabase: null as unknown as ReturnType<typeof import("@/test/fake-supabase").fakeSupabase>,
  exchange: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  getSignedInProfile: async () => state.user,
  createAdminSupabaseClient: async () => state.supabase.client,
}));
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v }));
vi.mock("@/lib/linkedin/client", () => ({ exchangeCodeForTokens: state.exchange, getProfile: state.profile }));
vi.mock("./profile-photo", () => ({ saveLinkedInPhoto: async () => undefined }));

import { handleLinkedInCallback } from "./oauth-callback";

async function callback(payload: { companyId: string; userId: string; returnTo?: "setup" | "publish" }) {
  const signed = await signOAuthState({ returnTo: "setup", ...payload }, "secret");
  return handleLinkedInCallback(new Request(`https://portal.example/api/auth/linkedin/callback?code=abc&state=${encodeURIComponent(signed)}`));
}
const upserts = () => state.supabase.calls.filter((c) => c.table === "company_social_accounts" && c.method === "upsert");

beforeEach(() => {
  process.env.LINKEDIN_CLIENT_ID = "id";
  process.env.LINKEDIN_CLIENT_SECRET = "secret";
  state.user = { id: "u-a", role: "client", company_id: A, can_publish: true };
  state.supabase = fakeSupabase({ companies: { data: { post_pack: "b2b" } } });
  state.exchange.mockReset().mockResolvedValue({ accessToken: "t", refreshToken: null, expiresAt: "2030-01-01T00:00:00Z", scope: "x" });
  state.profile.mockReset().mockResolvedValue({ name: "Scott", sub: "li-1", picture: null, email: "s@example.com", givenName: "S", familyName: "S" });
});

describe("LinkedIn callback", () => {
  it("lets a client with the publish right complete the flow they started for their own company", async () => {
    const res = await callback({ companyId: A, userId: "u-a" });
    expect(res.headers.get("location")).toBe(`https://portal.example/setup/${A}/social?linkedin_connected=1`);
    expect(upserts()).toHaveLength(1);
    expect((upserts()[0].args[0] as { company_id: string }).company_id).toBe(A);
  });
  it("refuses a client completing a state for another company, before any exchange or write", async () => {
    const res = await callback({ companyId: B, userId: "u-a" });
    expect(res.headers.get("location")).toContain("linkedin_error=not_authorised");
    expect(state.exchange).not.toHaveBeenCalled();
    expect(upserts()).toHaveLength(0);
  });
  it("refuses a different signed-in user from the one who started the flow", async () => {
    const res = await callback({ companyId: A, userId: "u-other" });
    expect(res.headers.get("location")).toContain("linkedin_error=not_signed_in");
    expect(state.exchange).not.toHaveBeenCalled();
    expect(upserts()).toHaveLength(0);
  });
  it("refuses a user whose publish right was withdrawn after the flow started", async () => {
    state.user = { id: "u-a", role: "client", company_id: A, can_publish: false };
    const res = await callback({ companyId: A, userId: "u-a" });
    expect(res.headers.get("location")).toContain("linkedin_error=not_authorised");
    expect(upserts()).toHaveLength(0);
  });
  it("refuses a hospitality venue's client", async () => {
    state.supabase = fakeSupabase({ companies: { data: { post_pack: "hospitality" } } });
    const res = await callback({ companyId: A, userId: "u-a" });
    expect(res.headers.get("location")).toContain("linkedin_error=not_authorised");
    expect(upserts()).toHaveLength(0);
  });
  it("refuses a visitor who is not signed in", async () => {
    state.user = null;
    const res = await callback({ companyId: A, userId: "u-a" });
    expect(res.headers.get("location")).toContain("linkedin_error=not_signed_in");
    expect(upserts()).toHaveLength(0);
  });
  it("still works for an admin on any company", async () => {
    state.user = { id: "admin-1", role: "admin", company_id: null, can_publish: true };
    const res = await callback({ companyId: B, userId: "admin-1" });
    expect(res.headers.get("location")).toBe(`https://portal.example/setup/${B}/social?linkedin_connected=1`);
    expect((upserts()[0].args[0] as { company_id: string }).company_id).toBe(B);
  });
});
