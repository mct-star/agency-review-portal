import { describe, expect, it } from "vitest";
import { errorLogLine, safeErrorText, summaryLogLine } from "./log-line";
import type { RunSummary } from "./run";

const totals = { due: 0, skippedInvalid: 0, wouldSend: 0, sent: 0, alreadySent: 0, heldByDailyLimit: 0, noTemplate: 0, failed: 0 };

describe("safeErrorText", () => {
  it("removes addresses and links and collapses whitespace", () => {
    expect(safeErrorText("bounce for  jo@x.com\nvia mailto:jo@x.com at https://a.example/b?c=d and www.q.example/r")).toBe("bounce for [removed] via [removed] at [removed] and [removed]");
  });
  it("caps the length", () => {
    expect(safeErrorText("x".repeat(500)).length).toBeLessThanOrEqual(123);
  });
  it("takes an Error or any value", () => {
    expect(safeErrorText(new Error("boom"))).toBe("boom");
    expect(safeErrorText(undefined)).toBe("");
  });
});

describe("summaryLogLine", () => {
  it("reduces a run to counts, with company ids only on failures", () => {
    const summary: RunSummary = {
      mode: "send",
      companies: [{ companyId: "c1", due: 0, wouldSend: 0, sent: 0, alreadySent: 0, heldByDailyLimit: 0, noTemplate: 0, skippedInvalid: 0 }],
      failures: [{ companyId: "c1", recipient: "jo@x.com", kind: "week_ready", subject_key: "Secret Title", error: "no route to jo@x.com" }],
      skipped: [
        { companyId: "c1", recipient: "jo@x.com", kind: "manual_publish", subject_key: "n1", reason: "the newsletter has no title" },
        { companyId: "c1", recipient: "jo@x.com", kind: "manual_publish", subject_key: "n2", reason: "the newsletter has no title" },
      ],
      dueByKind: { week_ready: 2 },
      totals: { ...totals, failed: 1 },
    };
    const line = summaryLogLine(summary);
    expect(line.startsWith("reminders: ")).toBe(true);
    expect(JSON.parse(line.slice(11))).toEqual({
      mode: "send",
      companies: 1,
      totals: { ...totals, failed: 1 },
      dueByKind: { week_ready: 2 },
      skippedByReason: { "the newsletter has no title": 2 },
      failures: [{ companyId: "c1", kind: "week_ready", error: "no route to [removed]" }],
    });
    expect(line).not.toContain("@");
    expect(line).not.toContain("Secret Title");
  });
});

describe("errorLogLine", () => {
  it("is the prefix and the cleaned message", () => {
    expect(errorLogLine(new Error("fail for a@b.co"))).toBe("reminders: fail for [removed]");
  });
});
