import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  exchangeXCode: vi.fn(),
  getXIdentity: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ requireAdmin: mocks.requireAdmin, createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
vi.mock("@/lib/crypto", () => ({ encrypt: (value: string) => `encrypted:${value}` }));
vi.mock("@/lib/x/oauth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/x/oauth")>()), exchangeXCode: mocks.exchangeXCode, getXIdentity: mocks.getXIdentity }));

import { GET as startX } from "./route";
import { GET as callbackX } from "./callback/route";
import { signXState, X_STATE_COOKIE } from "@/lib/x/oauth";

const companyId = "11111111-1111-4111-8111-111111111111";
const stateFor = (userId: string) => signXState({ companyId, userId, returnTo: "publish", nonce: "browser-nonce" }, "x-secret");

beforeEach(() => {
  vi.stubEnv("X_CLIENT_ID", "client-id");
  vi.stubEnv("X_CLIENT_SECRET", "x-secret");
  vi.stubEnv("X_REDIRECT_URI", "https://portal.example/api/auth/x/callback");
  mocks.requireAdmin.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.exchangeXCode.mockReset();
  mocks.getXIdentity.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("X OAuth browser authorization routes", () => {
  it("rejects a signed-out user before starting authorization", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await startX(new NextRequest(`https://portal.example/api/auth/x?companyId=${companyId}`));
    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects a callback without its initiating browser nonce", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin-a", role: "admin" });
    const request = new NextRequest(`https://portal.example/api/auth/x/callback?state=${encodeURIComponent(stateFor("admin-a"))}&code=auth-code`);
    const response = await callbackX(request);
    expect(new URL(response.headers.get("location")!).searchParams.get("x_error")).toBe("invalid_state");
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.exchangeXCode).not.toHaveBeenCalled();
  });

  it("rejects a valid browser state completed by a different signed-in admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin-b", role: "admin" });
    const request = new NextRequest(`https://portal.example/api/auth/x/callback?state=${encodeURIComponent(stateFor("admin-a"))}&code=auth-code`, {
      headers: { cookie: `${X_STATE_COOKIE}=browser-nonce.verifier` },
    });
    const response = await callbackX(request);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("companyId")).toBe(companyId);
    expect(location.searchParams.get("x_error")).toBe("admin_session_required");
    expect(mocks.exchangeXCode).not.toHaveBeenCalled();
  });
});
