import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLUESKY_OAUTH_SCOPE,
  BLUESKY_SESSION_MARKER,
  createBlueskyOAuthState,
  decodeBlueskySession,
  encodeBlueskySession,
  verifyBlueskyPendingState,
  verifyBlueskyOAuthState,
} from "./oauth";

describe("Bluesky OAuth state and stored sessions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("binds signed state to the initiating user, company and browser nonce", () => {
    vi.stubEnv("BLUESKY_OAUTH_PRIVATE_JWK", "unit-test-state-signing-key");
    const state = createBlueskyOAuthState({ companyId: "company-a", userId: "user-a", nonce: "nonce-a" }, 1_000_000);
    expect(verifyBlueskyOAuthState(state, "nonce-a", 1_001_000)).toMatchObject({ companyId: "company-a", userId: "user-a", nonce: "nonce-a" });
    expect(verifyBlueskyOAuthState(state, "nonce-b", 1_001_000)).toBeNull();
    expect(verifyBlueskyOAuthState(state, "nonce-a", 1_601_000)).toBeNull();
    expect(verifyBlueskyOAuthState(`${state}x`, "nonce-a", 1_001_000)).toBeNull();
  });

  it("preserves the signed Settings return target", () => {
    vi.stubEnv("BLUESKY_OAUTH_PRIVATE_JWK", "unit-test-state-signing-key");
    const state = createBlueskyOAuthState({ companyId: "company-a", userId: "user-a", nonce: "nonce-a", returnTo: "setup" });
    expect(verifyBlueskyOAuthState(state, "nonce-a")?.returnTo).toBe("setup");
  });

  it("requests only repo posting and image upload scopes", () => {
    expect(BLUESKY_OAUTH_SCOPE.split(" ")).toEqual([
      "atproto",
      "repo:app.bsky.feed.post",
      "rpc:com.atproto.repo.uploadBlob",
    ]);
  });

  it("accepts the signed appState stored under the SDK's separate random state key", () => {
    vi.stubEnv("BLUESKY_OAUTH_PRIVATE_JWK", "unit-test-state-signing-key");
    const appState = createBlueskyOAuthState({ companyId: "company-a", userId: "admin-a", nonce: "nonce-a" }, 1_000_000);
    expect(appState).not.toBe("sdk-random-state");
    expect(verifyBlueskyPendingState({ companyId: "company-a", userId: "admin-a", appState, expiresAt: new Date(1_500_000).toISOString() }, "nonce-a", 1_100_000))
      .toMatchObject({ companyId: "company-a", userId: "admin-a" });
    expect(verifyBlueskyPendingState({ companyId: "company-b", userId: "admin-a", appState, expiresAt: new Date(1_500_000).toISOString() }, "nonce-a", 1_100_000)).toBeNull();
    expect(verifyBlueskyPendingState({ companyId: "company-a", userId: "admin-a", appState, expiresAt: new Date(1_100_000).toISOString() }, "nonce-a", 1_100_000)).toBeNull();
  });

  it("marks and decodes an encrypted SDK session payload without exposing it as account metadata", () => {
    const saved = { marker: BLUESKY_SESSION_MARKER, did: "did:plc:test", session: { tokenSet: { access_token: "private" } } };
    const encoded = encodeBlueskySession(saved.did, saved.session as never);
    expect(decodeBlueskySession(encoded)).toEqual(saved);
    expect(decodeBlueskySession("not-json")).toBeNull();
  });
});
