import { describe, expect, it, vi } from "vitest";
import { buildLiveSummary, linkProblem, runLiveCheck, type LiveCheckPorts, type PublishedJob } from "./live-check";

const now = new Date("2026-12-01T09:00:00Z");
const job = (over: Partial<PublishedJob> = {}): PublishedJob => ({
  id: "job-1", company_id: "co-1", social_account_id: "acc-1", target_platform: "linkedin_personal", external_id: "urn:li:share:1",
  external_url: "https://www.linkedin.com/feed/update/urn:li:share:1/", scheduled_for: "2026-11-30T08:30:00Z", published_at: "2026-11-30T08:30:05Z",
  publish_payload: { commentary: "A post about something" }, ...over,
});

function ports(jobs: PublishedJob[], exists: LiveCheckPorts["exists"] = async () => "live"): LiveCheckPorts & { claimed: Set<string> } {
  const claimed = new Set<string>();
  return {
    claimed, baseUrl: "https://portal.test",
    listPublished: async () => jobs,
    contextFor: async () => new Map(jobs.map((j) => [j.id, { accountName: `Acc ${j.id}`, companyName: "Co" }])),
    exists: vi.fn(exists),
    claim: async (id) => { if (claimed.has(id)) return false; claimed.add(id); return true; },
    release: async (id) => { claimed.delete(id); },
    send: vi.fn(async () => ({ delivered: true, slack: "skipped" as const, emailed: 1 })),
  };
}

describe("linkProblem", () => {
  it("flags a missing post ID or link and accepts a complete job", () => {
    expect(linkProblem(job())).toBeNull();
    expect(linkProblem(job({ external_id: null }))).toBe("no_post_id");
    expect(linkProblem(job({ external_id: "  " }))).toBe("no_post_id");
    expect(linkProblem(job({ external_url: "" }))).toBe("no_link");
  });
});

describe("runLiveCheck", () => {
  it("sends nothing when every job has a link and the post still exists", async () => {
    const p = ports([job(), job({ id: "job-2" })]);
    const out = await runLiveCheck(p, now);
    expect(out).toMatchObject({ checked: 2, problems: 0, alertSent: false });
    expect(p.send).not.toHaveBeenCalled();
  });
  it("sends one summary listing every problem", async () => {
    const p = ports([job({ id: "a", external_url: null }), job({ id: "b" }), job({ id: "c" })], async (j) => (j.id === "c" ? "missing" : "live"));
    const out = await runLiveCheck(p, now);
    expect(p.send).toHaveBeenCalledTimes(1);
    const alert = vi.mocked(p.send).mock.calls[0][0];
    expect(alert.subject).toBe("Publishing check: 2 posts need a look");
    expect(alert.fields).toHaveLength(2);
    expect(JSON.stringify(alert)).toContain("no live link was stored");
    expect(JSON.stringify(alert)).toContain("LinkedIn no longer shows the post");
    expect(JSON.stringify(alert)).not.toMatch(/[—–]/);
    expect(out).toMatchObject({ problems: 2, reported: 2, alertSent: true });
  });
  it("does not report the same job again the next day", async () => {
    const p = ports([job({ external_id: null })]);
    await runLiveCheck(p, now);
    const second = await runLiveCheck(p, now);
    expect(p.send).toHaveBeenCalledTimes(1);
    expect(second.alertSent).toBe(false);
  });
  it("treats an unreadable post as unverified, not as a problem", async () => {
    const p = ports([job()], async () => "unknown");
    const out = await runLiveCheck(p, now);
    expect(out).toMatchObject({ problems: 0, unverified: 1, alertSent: false });
  });
  it("does not check existence for a job whose link is already missing", async () => {
    const p = ports([job({ external_url: null })]);
    await runLiveCheck(p, now);
    expect(p.exists).not.toHaveBeenCalled();
  });
  it("releases claims when the summary could not be delivered", async () => {
    const p = ports([job({ external_id: null })]);
    p.send = vi.fn(async () => ({ delivered: false, slack: "skipped" as const, emailed: 0 }));
    const out = await runLiveCheck(p, now);
    expect(out.alertSent).toBe(false);
    expect(p.claimed.size).toBe(0);
  });
});

describe("buildLiveSummary", () => {
  it("uses singular wording for one post", () => {
    const alert = buildLiveSummary([{ job: job({ external_id: null }), problem: "no_post_id", ctx: { accountName: "Michael", companyName: "Co" } }], 5, "https://portal.test/");
    expect(alert.subject).toBe("Publishing check: 1 post needs a look");
    expect(alert.fixUrl).toBe("https://portal.test/publish");
  });
});
