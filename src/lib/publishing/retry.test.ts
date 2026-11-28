import { describe, expect, it } from "vitest";
import { MAX_RETRIES, RETRY_DELAY_MS, decideRetry, transientReason } from "./retry";

const facts = { error: new Error("LinkedIn request failed (503): unavailable"), createRequestStarted: false, retryCount: 0, externalId: null, siblingPublished: false };

describe("transientReason", () => {
  it("treats 429 and 5xx as transient", () => {
    expect(transientReason(new Error("LinkedIn request failed (429): slow down"))).toBe("rate_limited");
    expect(transientReason(new Error("LinkedIn request failed (503): x"))).toBe("server_error");
    expect(transientReason(new Error("LinkedIn request failed (500): x"))).toBe("server_error");
  });
  it("never treats a 4xx content error as transient", () => {
    for (const code of [400, 401, 403, 404, 422]) expect(transientReason(new Error(`LinkedIn request failed (${code}): no`))).toBeNull();
  });
  it("recognises network failures", () => {
    expect(transientReason(new TypeError("fetch failed"))).toBe("network");
    const timeout = new Error("The operation timed out"); timeout.name = "TimeoutError";
    expect(transientReason(timeout)).toBe("network");
    expect(transientReason(Object.assign(new Error("boom"), { cause: { code: "ECONNRESET" } }))).toBe("network");
  });
  it("does not retry plain preparation errors or non-errors", () => {
    expect(transientReason(new Error("The post has no publishable text"))).toBeNull();
    expect(transientReason("string")).toBeNull();
  });
});

describe("decideRetry", () => {
  it("retries a transient failure once, five minutes on", () => {
    expect(decideRetry(facts)).toEqual({ retry: true, reason: "server_error" });
    expect(MAX_RETRIES).toBe(1);
    expect(RETRY_DELAY_MS).toBe(5 * 60_000);
  });
  it("does not retry a second time", () => {
    expect(decideRetry({ ...facts, retryCount: 1 }).retry).toBe(false);
  });
  it("does not retry a 4xx content error", () => {
    expect(decideRetry({ ...facts, error: new Error("LinkedIn request failed (422): bad") }).retry).toBe(false);
  });
  it("never retries once the create-post request was sent, because the post may be live", () => {
    expect(decideRetry({ ...facts, createRequestStarted: true }).retry).toBe(false);
  });
  it("never publishes twice: no retry when the job or a sibling already has a live post", () => {
    expect(decideRetry({ ...facts, externalId: "urn:li:share:1" }).retry).toBe(false);
    expect(decideRetry({ ...facts, siblingPublished: true }).retry).toBe(false);
  });
});
