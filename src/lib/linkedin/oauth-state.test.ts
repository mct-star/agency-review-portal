import { describe, expect, it } from "vitest";
import { OAUTH_STATE_TTL_SECONDS, signOAuthState, verifyOAuthState } from "./oauth-state";

const payload = { companyId: "11111111-1111-4111-8111-111111111111", userId: "u-1", returnTo: "setup" as const };

describe("LinkedIn OAuth state", () => {
  it("round-trips a signed payload", async () => {
    const state = await signOAuthState(payload, "secret");
    expect(await verifyOAuthState(state, "secret")).toEqual(payload);
  });
  it("rejects a tampered company id, a wrong secret and a bare id", async () => {
    const state = await signOAuthState(payload, "secret");
    const [p, exp, sig] = state.split(".");
    const other = Buffer.from(JSON.stringify({ ...payload, companyId: "22222222-2222-4222-8222-222222222222" })).toString("base64url");
    expect(await verifyOAuthState(`${other}.${exp}.${sig}`, "secret")).toBeNull();
    expect(await verifyOAuthState(`${p}.${exp}.${sig}`, "wrong")).toBeNull();
    expect(await verifyOAuthState(payload.companyId, "secret")).toBeNull();
    expect(await verifyOAuthState(state, "")).toBeNull();
  });
  it("expires", async () => {
    const t0 = 1_700_000_000_000;
    const state = await signOAuthState(payload, "secret", t0);
    expect(await verifyOAuthState(state, "secret", t0 + (OAUTH_STATE_TTL_SECONDS - 1) * 1000)).toEqual(payload);
    expect(await verifyOAuthState(state, "secret", t0 + (OAUTH_STATE_TTL_SECONDS + 1) * 1000)).toBeNull();
  });
});
