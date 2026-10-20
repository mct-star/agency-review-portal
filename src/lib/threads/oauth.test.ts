import { describe, expect, it } from "vitest";
import { createThreadsState, verifyThreadsState } from "./oauth";

describe("Threads signed local return destination", () => {
  it("binds Settings to the company, user and nonce while rejecting tampering", () => {
    const now = 1_800_000_000_000;
    const state = createThreadsState({ companyId: "company-a", userId: "admin-a", nonce: "nonce-a", returnTo: "setup" }, "test-secret", now);
    expect(verifyThreadsState(state, "nonce-a", "test-secret", now)).toMatchObject({ returnTo: "setup", companyId: "company-a", userId: "admin-a" });
    expect(verifyThreadsState(state, "nonce-b", "test-secret", now)).toBeNull();
    expect(verifyThreadsState(`${state}x`, "nonce-a", "test-secret", now)).toBeNull();
    expect(verifyThreadsState(state, "nonce-a", "test-secret", now + 11 * 60_000)).toBeNull();
  });
});
