import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { signOAuthState } from "./oauth-state";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  supabase: null as unknown as ReturnType<typeof import("@/test/fake-supabase").fakeSupabase>,
  exchange: vi.fn(),
  profile: vi.fn(),
  organisations: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  getSignedInProfile: async () => state.user,
  createAdminSupabaseClient: async () => state.supabase.client,
}));
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v }));
vi.mock("@/lib/linkedin/client", () => ({ exchangeCodeForTokens: state.exchange, getProfile: state.profile, getAdministeredOrganizations: state.organisations }));
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
  state.organisations.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  delete process.env.LINKEDIN_PUBLISHER_CLIENT_ID;
  delete process.env.LINKEDIN_PUBLISHER_CLIENT_SECRET;
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

describe("LinkedIn callback through the AGENCY Content Publisher app", () => {
  const SCOPES = "r_basicprofile,w_member_social,w_member_social_feed,w_organization_social,w_organization_social_feed,r_organization_social,rw_organization_admin";
  const updates = () => state.supabase.calls.filter((c) => c.table === "company_social_accounts" && c.method === "update");
  beforeEach(() => {
    process.env.LINKEDIN_PUBLISHER_CLIENT_ID = "pub-id";
    process.env.LINKEDIN_PUBLISHER_CLIENT_SECRET = "pub-secret";
    state.user = { id: "admin-1", role: "admin", company_id: null, can_publish: true };
    // An upsert returns the saved row; the lookup of other personal rows returns a URL-only stub,
    // an expired row for the same person, and someone else's working connection.
    state.supabase = fakeSupabase({ companies: { data: { post_pack: "b2b" } }, company_social_accounts: (calls) => calls.some((c) => c.method === "upsert")
      ? { data: { id: "new-row" } }
      : { data: [
        { id: "stub", account_name: null, access_token_encrypted: null, token_expires_at: null },
        { id: "old-app", account_name: "scott", access_token_encrypted: "enc:old", token_expires_at: "2026-05-01T00:00:00Z" },
        { id: "colleague", account_name: "Someone Else", access_token_encrypted: "enc:x", token_expires_at: "2026-05-01T00:00:00Z" },
      ] } });
    state.exchange.mockResolvedValue({ accessToken: "t", refreshToken: null, expiresAt: "2030-01-01T00:00:00Z", scope: SCOPES });
    state.organisations.mockResolvedValue([{ id: "111", urn: "urn:li:organization:111", name: "AGENCY", vanityName: "agency-bristol" }]);
  });

  async function connect() {
    const signed = await signOAuthState({ returnTo: "setup", companyId: A, userId: "admin-1" }, "pub-secret");
    return handleLinkedInCallback(new Request(`https://portal.example/api/auth/linkedin/callback?code=abc&state=${encodeURIComponent(signed)}`));
  }

  it("exchanges the code with the publisher app and reads the member with its granted scope", async () => {
    await connect();
    expect(state.exchange).toHaveBeenCalledWith("abc", "pub-id", "pub-secret", "https://portal.example/api/auth/linkedin/callback", expect.stringContaining("w_organization_social"));
    expect(state.profile).toHaveBeenCalledWith("t", SCOPES);
  });

  it("stores the personal profile and each page the member administers as a company page account", async () => {
    const res = await connect();
    expect(res.headers.get("location")).toBe(`https://portal.example/setup/${A}/social?linkedin_connected=1&linkedin_pages=1`);
    const rows = upserts().map((c) => c.args[0] as Record<string, unknown>);
    expect(rows[0]).toMatchObject({ company_id: A, platform: "linkedin_personal", account_id: "li-1", access_token_encrypted: "enc:t", is_active: true });
    expect(rows[0].platform_metadata).toMatchObject({ app: "publisher", scope: SCOPES });
    expect(rows[1]).toMatchObject({ company_id: A, platform: "linkedin_company", account_id: "111", account_name: "AGENCY", access_token_encrypted: "enc:t", token_expires_at: "2030-01-01T00:00:00Z", is_active: true });
    expect(rows[1].platform_metadata).toMatchObject({ app: "publisher", organization_urn: "urn:li:organization:111", vanity_name: "agency-bristol", connected_member_id: "li-1" });
  });

  it("retires stub and superseded personal rows only after the working connection is saved", async () => {
    await connect();
    const upsertIndex = state.supabase.calls.findIndex((c) => c.table === "company_social_accounts" && c.method === "upsert");
    const updateIndex = state.supabase.calls.findIndex((c) => c.table === "company_social_accounts" && c.method === "update");
    expect(updateIndex).toBeGreaterThan(upsertIndex);
    expect(updates()[0].args[0]).toEqual({ is_active: false });
    const after = state.supabase.calls.slice(updateIndex);
    expect(after).toContainEqual(expect.objectContaining({ method: "eq", args: ["company_id", A] }));
    expect(after).toContainEqual(expect.objectContaining({ method: "eq", args: ["platform", "linkedin_personal"] }));
    expect(after).toContainEqual(expect.objectContaining({ method: "neq", args: ["id", "new-row"] }));
    expect(after).toContainEqual(expect.objectContaining({ method: "in", args: ["id", ["stub", "old-app"]] }));
    expect(state.supabase.calls.some((c) => c.method === "delete")).toBe(false);
  });

  it("retires nothing when the connection could not be saved", async () => {
    state.supabase = fakeSupabase({ companies: { data: { post_pack: "b2b" } }, company_social_accounts: { data: null, error: { message: "nope" } } });
    const res = await connect();
    expect(res.headers.get("location")).toContain("linkedin_error=");
    expect(updates()).toHaveLength(0);
    expect(state.organisations).not.toHaveBeenCalled();
  });

  it("keeps the personal connection and says so when the page list cannot be read", async () => {
    state.organisations.mockRejectedValue(new Error("LinkedIn organisation lookup failed (403): no"));
    const res = await connect();
    expect(res.headers.get("location")).toBe(`https://portal.example/setup/${A}/social?linkedin_connected=1&linkedin_pages_error=1`);
    expect(upserts()).toHaveLength(1);
  });

  it("does not look for pages with the older app's member-only grant", async () => {
    delete process.env.LINKEDIN_PUBLISHER_CLIENT_ID;
    delete process.env.LINKEDIN_PUBLISHER_CLIENT_SECRET;
    state.exchange.mockResolvedValue({ accessToken: "t", refreshToken: null, expiresAt: "2030-01-01T00:00:00Z", scope: "openid profile w_member_social" });
    const signed = await signOAuthState({ returnTo: "setup", companyId: A, userId: "admin-1" }, "secret");
    const res = await handleLinkedInCallback(new Request(`https://portal.example/api/auth/linkedin/callback?code=abc&state=${encodeURIComponent(signed)}`));
    expect(res.headers.get("location")).toBe(`https://portal.example/setup/${A}/social?linkedin_connected=1`);
    expect(state.organisations).not.toHaveBeenCalled();
  });
});
