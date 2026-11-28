import { describe, expect, it, vi } from "vitest";
import { MAX_ALERTS_PER_RUN, alertKindFor, buildJobAlert, firstLineOf, runPublishingWatch, ukTime, type WatchJob, type WatchPorts } from "./job-alerts";

const now = new Date("2026-12-01T09:00:00Z");
const job = (over: Partial<WatchJob> = {}): WatchJob => ({
  id: "job-1", company_id: "co-1", social_account_id: "acc-1", target_platform: "linkedin_personal", status: "scheduled",
  scheduled_for: "2026-12-01T08:00:00Z", created_at: "2026-11-30T10:00:00Z", published_at: null, error_message: null,
  publish_payload: { provider: "linkedin-direct-v1", commentary: "\nFirst line of the post\nSecond line" }, response_payload: null, ...over,
});
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("alertKindFor (late detection)", () => {
  it("is not late at 14 minutes and is late at 15", () => {
    expect(alertKindFor(job({ scheduled_for: minutesAgo(14) }), now)).toBeNull();
    expect(alertKindFor(job({ scheduled_for: minutesAgo(15) }), now)).toBe("late");
  });
  it("counts queued, scheduled and running jobs as late, never published or cancelled ones", () => {
    for (const status of ["queued", "scheduled", "running"]) expect(alertKindFor(job({ status, scheduled_for: minutesAgo(30) }), now)).toBe("late");
    expect(alertKindFor(job({ status: "published", scheduled_for: minutesAgo(30) }), now)).toBeNull();
    expect(alertKindFor(job({ status: "cancelled", scheduled_for: minutesAgo(30) }), now)).toBeNull();
  });
  it("ignores jobs with no schedule", () => {
    expect(alertKindFor(job({ scheduled_for: null }), now)).toBeNull();
  });
  it("flags failed jobs and failed first comments", () => {
    expect(alertKindFor(job({ status: "failed" }), now)).toBe("failed");
    expect(alertKindFor(job({ status: "published", response_payload: { comment_failed: true } }), now)).toBe("comment_failed");
    expect(alertKindFor(job({ status: "published", response_payload: { comment_error: null } }), now)).toBeNull();
  });
});

describe("alert text", () => {
  const ctx = { accountName: "Michael Colling-Tuck", companyName: "AGENCY Bristol" };
  it("names the account, time, first line, error and the page to fix it on", () => {
    const alert = buildJobAlert(job({ status: "failed", error_message: "LinkedIn rejected the post (HTTP 422). — check it." }), "failed", ctx, "https://portal.test/");
    const flat = JSON.stringify(alert);
    expect(flat).toContain("Michael Colling-Tuck");
    expect(flat).toContain("Tue 1 Dec 2026, 08:00");
    expect(flat).toContain("First line of the post");
    expect(flat).toContain("HTTP 422");
    expect(alert.fixUrl).toBe("https://portal.test/publish");
    expect(flat).not.toMatch(/[—–]/);
  });
  it("says when a failure came after the one automatic retry", () => {
    const alert = buildJobAlert(job({ status: "failed", error_message: "x", publish_payload: { commentary: "Hi", retry_count: 1 } }), "failed", ctx, "https://portal.test");
    expect(JSON.stringify(alert)).toContain("retried once automatically");
  });
  it("reads the first line from LinkedIn, Meta and social payloads", () => {
    expect(firstLineOf({ caption: "\n\nMeta line\nmore" })).toBe("Meta line");
    expect(firstLineOf({ text: "Social line" })).toBe("Social line");
    expect(firstLineOf(null)).toContain("could not be read");
  });
  it("formats UK time", () => {
    expect(ukTime("2026-07-01T07:30:00Z")).toBe("Wed 1 Jul 2026, 08:30");
  });
});

function ports(jobs: WatchJob[], over: Partial<WatchPorts> = {}) {
  const claimed = new Set<string>();
  const p: WatchPorts = {
    baseUrl: "https://portal.test",
    listCandidates: async () => jobs,
    contextFor: async () => new Map(jobs.map((j) => [j.id, { accountName: "Acc", companyName: "Co" }])),
    claim: vi.fn(async (id: string, kind: string) => { const k = `${id}:${kind}`; if (claimed.has(k)) return false; claimed.add(k); return true; }),
    release: vi.fn(async (id: string, kind: string) => { claimed.delete(`${id}:${kind}`); }),
    send: vi.fn(async () => ({ delivered: true, slack: "skipped" as const, emailed: 1 })),
    ...over,
  };
  return p;
}

describe("runPublishingWatch (idempotency)", () => {
  it("alerts once per job and kind across repeated runs", async () => {
    const p = ports([job({ status: "failed", error_message: "boom" })]);
    expect((await runPublishingWatch(p, now)).alerted).toBe(1);
    const second = await runPublishingWatch(p, now);
    expect(second.alerted).toBe(0);
    expect(second.skippedAlreadySent).toBe(1);
    expect(p.send).toHaveBeenCalledTimes(1);
  });
  it("alerts separately for different kinds on the same job", async () => {
    const p = ports([job({ status: "published", response_payload: { comment_failed: true } })]);
    await runPublishingWatch(p, now);
    expect(p.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.claim)).toHaveBeenCalledWith("job-1", "comment_failed");
  });
  it("sends nothing for healthy jobs", async () => {
    const p = ports([job({ status: "published" }), job({ id: "j2", scheduled_for: minutesAgo(3) })]);
    const out = await runPublishingWatch(p, now);
    expect(out.alerted).toBe(0);
    expect(p.send).not.toHaveBeenCalled();
    expect(p.claim).not.toHaveBeenCalled();
  });
  it("releases the claim when nothing was delivered, so the next run tries again", async () => {
    let delivered = false;
    const p = ports([job({ status: "failed" })], { send: vi.fn(async () => ({ delivered, slack: "skipped" as const, emailed: 0 })) });
    expect((await runPublishingWatch(p, now)).undelivered).toBe(1);
    delivered = true;
    expect((await runPublishingWatch(p, now)).alerted).toBe(1);
  });
  it("caps alerts per run and defers the rest", async () => {
    const many = Array.from({ length: MAX_ALERTS_PER_RUN + 3 }, (_, i) => job({ id: `j${i}`, status: "failed" }));
    const out = await runPublishingWatch(ports(many), now);
    expect(out.alerted).toBe(MAX_ALERTS_PER_RUN);
    expect(out.deferred).toBe(3);
  });
});
