import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeXCode, getXAuthorizationUrl, makeXChallenge, signXState, verifyXState, X_SCOPES } from "./oauth";

afterEach(() => vi.unstubAllGlobals());

describe("X OAuth", () => {
  it("signs company/user state and rejects tampering and expiry", () => {
    const payload = { companyId: "company-a", userId: "admin-a", returnTo: "setup" as const, nonce: "nonce" };
    const state = signXState(payload, "state-secret", 1_000_000);
    expect(verifyXState(state, "state-secret", 1_001_000)).toEqual(payload);
    expect(verifyXState(`${state}x`, "state-secret", 1_001_000)).toBeNull();
    expect(verifyXState(state, "state-secret", 1_700_000)).toBeNull();
    expect(verifyXState(state, "wrong-secret", 1_001_000)).toBeNull();
  });

  it("requests only publishing scopes and a PKCE S256 challenge", () => {
    const url = getXAuthorizationUrl("client-id", "https://portal.example/api/auth/x/callback", "signed-state", "verifier");
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...X_SCOPES]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(makeXChallenge("verifier"));
  });

  it("uses confidential-client credentials and preserves the offline refresh grant", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-value",
      refresh_token: "refresh-value",
      expires_in: 7200,
      scope: [...X_SCOPES].join(" "),
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const grant = await exchangeXCode("auth-code", "verifier", "client-id", "https://portal.example/callback", "client-secret");
    expect(grant.accessToken).toBe("access-value");
    expect(grant.refreshToken).toBe("refresh-value");
    expect(grant.scope).toEqual([...X_SCOPES]);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Headers).get("Authorization")).toMatch(/^Basic /);
    expect(String(init?.body)).toContain("code_verifier=verifier");
  });
});
