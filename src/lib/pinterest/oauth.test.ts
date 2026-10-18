import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangePinterestCode, getPinterestAuthorizationUrl, signPinterestState, verifyPinterestState, PINTEREST_SCOPES } from "./oauth";

afterEach(() => vi.unstubAllGlobals());

describe("Pinterest OAuth", () => {
  it("signs company/user state and rejects tampering and expiry", () => {
    const payload = { companyId: "company-b", userId: "admin-b", returnTo: "publish" as const, nonce: "nonce-b" };
    const state = signPinterestState(payload, "state-secret", 1_000_000);
    expect(verifyPinterestState(state, "state-secret", 1_001_000)).toEqual(payload);
    expect(verifyPinterestState(`${state}x`, "state-secret", 1_001_000)).toBeNull();
    expect(verifyPinterestState(state, "state-secret", 1_700_000)).toBeNull();
    expect(verifyPinterestState(state, "wrong-secret", 1_001_000)).toBeNull();
  });

  it("requests only board read and pin write scopes", () => {
    const url = getPinterestAuthorizationUrl("client-id", "https://portal.example/api/auth/pinterest/callback", "signed-state");
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...PINTEREST_SCOPES]);
    expect(url.searchParams.get("state")).toBe("signed-state");
  });

  it("uses confidential-client authentication and stores an offline refresh grant", async () => {
    const refreshTokenExpiresAt = 1_900_000_000;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "pina-access",
      refresh_token: "pinr-refresh",
      expires_in: 2592000,
      refresh_token_expires_in: 31536000,
      refresh_token_expires_at: refreshTokenExpiresAt,
      scope: [...PINTEREST_SCOPES].join(" "),
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const grant = await exchangePinterestCode("auth-code", "client-id", "client-secret", "https://portal.example/callback");
    expect(grant.accessToken).toBe("pina-access");
    expect(grant.refreshToken).toBe("pinr-refresh");
    expect(grant.refreshTokenExpiresAt).toBe(new Date(refreshTokenExpiresAt * 1000).toISOString());
    expect(grant.scope).toEqual([...PINTEREST_SCOPES]);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Basic /);
    expect(String(init?.body)).toContain("redirect_uri=https%3A%2F%2Fportal.example%2Fcallback");
  });
});
