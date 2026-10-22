import { describe, expect, it } from "vitest";
import { signYouTubeOAuthState, verifyYouTubeOAuthState, YOUTUBE_STATE_TTL_SECONDS } from "./oauth-state";

const payload = {
  companyId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  returnTo: "publish" as const,
  nonce: "abcdefghijklmnopqrstuvwx12345678",
};

describe("YouTube OAuth state", () => {
  it("signs a company, user, return path and browser nonce", async () => {
    const state = await signYouTubeOAuthState(payload, "state-secret");
    expect(await verifyYouTubeOAuthState(state, "state-secret")).toEqual(payload);
  });

  it("rejects a changed nonce, changed user, wrong secret and missing browser nonce", async () => {
    const state = await signYouTubeOAuthState(payload, "state-secret");
    const [encoded, expiry, signature] = state.split(".");
    const changed = Buffer.from(JSON.stringify({ ...payload, nonce: "zyxwvutsrqponmlkjihgfedcba8765432" })).toString("base64url");
    expect(await verifyYouTubeOAuthState(`${changed}.${expiry}.${signature}`, "state-secret")).toBeNull();
    expect(await verifyYouTubeOAuthState(state, "wrong-secret")).toBeNull();
    expect(await verifyYouTubeOAuthState(encoded, "state-secret")).toBeNull();
  });

  it("expires", async () => {
    const now = 1_700_000_000_000;
    const state = await signYouTubeOAuthState(payload, "state-secret", now);
    expect(await verifyYouTubeOAuthState(state, "state-secret", now + (YOUTUBE_STATE_TTL_SECONDS - 1) * 1000)).toEqual(payload);
    expect(await verifyYouTubeOAuthState(state, "state-secret", now + (YOUTUBE_STATE_TTL_SECONDS + 1) * 1000)).toBeNull();
  });
});
