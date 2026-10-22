import { describe, expect, it } from "vitest";
import { directLinkedInJobId, linkedinOutcomeMayBeUncertain } from "./direct-publish";

describe("direct LinkedIn job identity and outcome safety", () => {
  it("uses one stable UUID per company, piece and explicit account", () => {
    const first = directLinkedInJobId("company-a", "piece-a", "account-a");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(directLinkedInJobId("company-a", "piece-a", "account-a")).toBe(first);
    expect(directLinkedInJobId("company-a", "piece-a", "account-b")).not.toBe(first);
    expect(directLinkedInJobId("company-b", "piece-a", "account-a")).not.toBe(first);
  });

  it("marks transport and server failures uncertain but definitive client rejection failed", () => {
    expect(linkedinOutcomeMayBeUncertain(new TypeError("fetch failed"))).toBe(true);
    expect(linkedinOutcomeMayBeUncertain(new Error("LinkedIn post creation failed (503)"))).toBe(true);
    expect(linkedinOutcomeMayBeUncertain(new Error("LinkedIn post creation failed (401)"))).toBe(false);
  });
});
