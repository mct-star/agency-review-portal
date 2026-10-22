import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireCompanyUser: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  exchangePinterestCode: vi.fn(),
  getPinterestIdentity: vi.fn(),
  listPinterestBoards: vi.fn(),
  refreshPinterestGrant: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ requireAdmin: mocks.requireAdmin, requireCompanyUser: mocks.requireCompanyUser, createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn(() => "decrypted-access-token"), encrypt: (value: string) => `encrypted:${value}` }));
vi.mock("@/lib/pinterest/oauth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/pinterest/oauth")>()), exchangePinterestCode: mocks.exchangePinterestCode, getPinterestIdentity: mocks.getPinterestIdentity, listPinterestBoards: mocks.listPinterestBoards, refreshPinterestGrant: mocks.refreshPinterestGrant }));

import { GET as startPinterest } from "./route";
import { GET as callbackPinterest } from "./callback/route";
import { GET as listBoards } from "./boards/route";
import { signPinterestState, PINTEREST_STATE_COOKIE } from "@/lib/pinterest/oauth";

const companyId = "22222222-2222-4222-8222-222222222222";
const stateFor = (userId: string) => signPinterestState({ companyId, userId, returnTo: "publish", nonce: "browser-nonce" }, "pinterest-secret");
const boardsRequest = (company = companyId) => new NextRequest(`https://portal.example/api/auth/pinterest/boards?companyId=${company}&socialAccountId=account-a`);

beforeEach(() => {
  vi.stubEnv("PINTEREST_CLIENT_ID", "client-id");
  vi.stubEnv("PINTEREST_CLIENT_SECRET", "pinterest-secret");
  vi.stubEnv("PINTEREST_REDIRECT_URI", "https://portal.example/api/auth/pinterest/callback");
  mocks.requireAdmin.mockReset();
  mocks.requireCompanyUser.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.exchangePinterestCode.mockReset();
  mocks.getPinterestIdentity.mockReset();
  mocks.listPinterestBoards.mockReset();
  mocks.refreshPinterestGrant.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("Pinterest OAuth and board routes", () => {
  it("rejects a signed-out user before starting authorization", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await startPinterest(new NextRequest(`https://portal.example/api/auth/pinterest?companyId=${companyId}`));
    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects a callback without its initiating browser nonce", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin-a", role: "admin" });
    const request = new NextRequest(`https://portal.example/api/auth/pinterest/callback?state=${encodeURIComponent(stateFor("admin-a"))}&code=auth-code`);
    const response = await callbackPinterest(request);
    expect(new URL(response.headers.get("location")!).searchParams.get("pinterest_error")).toBe("invalid_state");
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.exchangePinterestCode).not.toHaveBeenCalled();
  });

  it("rejects a valid browser state completed by a different signed-in admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin-b", role: "admin" });
    const request = new NextRequest(`https://portal.example/api/auth/pinterest/callback?state=${encodeURIComponent(stateFor("admin-a"))}&code=auth-code`, {
      headers: { cookie: `${PINTEREST_STATE_COOKIE}=browser-nonce` },
    });
    const response = await callbackPinterest(request);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("companyId")).toBe(companyId);
    expect(location.searchParams.get("pinterest_error")).toBe("admin_session_required");
    expect(mocks.exchangePinterestCode).not.toHaveBeenCalled();
  });

  it("denies a user outside the requested company before reading the account", async () => {
    mocks.requireCompanyUser.mockResolvedValue(null);
    const response = await listBoards(boardsRequest());
    expect(response.status).toBe(401);
    expect(mocks.requireCompanyUser).toHaveBeenCalledWith(companyId);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("denies a company user without publishing permission before reading the account", async () => {
    mocks.requireCompanyUser.mockResolvedValue({ id: "member", role: "client", company_id: companyId, can_publish: false });
    const response = await listBoards(boardsRequest());
    expect(response.status).toBe(403);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("refreshes an expired grant before listing boards without exposing credentials", async () => {
    mocks.requireCompanyUser.mockResolvedValue({ id: "member", role: "client", company_id: companyId, can_publish: true });
    const db = fakeSupabase({ company_social_accounts: { data: { id: "account-a", company_id: companyId, account_id: "agency", access_token_encrypted: "encrypted:old", refresh_token_encrypted: "encrypted:refresh", token_expires_at: "2020-01-01T00:00:00Z", platform_metadata: {} } } });
    mocks.createAdminSupabaseClient.mockResolvedValue(db.client);
    mocks.refreshPinterestGrant.mockResolvedValue({ accessToken: "rotated-access", refreshToken: "rotated-refresh", expiresAt: "2099-01-01T00:00:00Z", refreshTokenExpiresAt: null, scope: ["boards:read", "pins:write"] });
    mocks.getPinterestIdentity.mockResolvedValue({ username: "agency" });
    mocks.listPinterestBoards.mockResolvedValue([{ id: "board-a", name: "AGENCY", privacy: "PUBLIC" }]);
    const response = await listBoards(boardsRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ boards: [{ id: "board-a", name: "AGENCY" }] });
    expect(mocks.listPinterestBoards).toHaveBeenCalledWith("rotated-access");
    expect(db.calls).toContainEqual({ table: "company_social_accounts", method: "eq", args: ["company_id", companyId] });
    expect(db.calls).toContainEqual({ table: "company_social_accounts", method: "update", args: [expect.objectContaining({ access_token_encrypted: "encrypted:rotated-access", refresh_token_encrypted: "encrypted:rotated-refresh" })] });
  });
});
