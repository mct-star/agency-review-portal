import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LinkedInApiError, analyticsEntity, fetchMemberPostFigures, fetchOrganisationPostFigures,
  listAuthorPosts, parseOrganisationStatistics, sumCounts,
} from "./analytics";

const SHARE = "urn:li:share:7325786486870552578";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const count = (n: number) => json({ elements: [{ count: n, metricType: "X", targetEntity: { share: SHARE } }] });

afterEach(() => { vi.unstubAllGlobals(); });

describe("Member Post Analytics", () => {
  it("names a share or a ugcPost the way the API expects", () => {
    expect(analyticsEntity(SHARE)).toBe("(share:urn%3Ali%3Ashare%3A7325786486870552578)");
    expect(analyticsEntity("urn:li:ugcPost:1")).toBe("(ugc:urn%3Ali%3AugcPost%3A1)");
  });

  it("reads the lifetime total and tolerates an empty reply", () => {
    expect(sumCounts({ elements: [{ count: 41 }] })).toBe(41);
    expect(sumCounts({ elements: [] })).toBe(0);
    expect(sumCounts(null)).toBe(0);
  });

  it("makes one TOTAL call per metric with the version headers and maps them to the figures", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const answers: Record<string, number> = { IMPRESSION: 1200, REACTION: 30, COMMENT: 4, RESHARE: 2, LINK_CLICKS: 9 };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return count(answers[url.match(/queryType=(\w+)/)![1]]);
    }));
    const figures = await fetchMemberPostFigures("tok", SHARE);
    expect(figures).toEqual({ impressions: 1200, reactions: 30, comments: 4, reshares: 2, clicks: 9 });
    expect(calls.map((c) => c.url.match(/queryType=(\w+)/)![1])).toEqual(["IMPRESSION", "REACTION", "COMMENT", "RESHARE", "LINK_CLICKS"]);
    expect(calls[0].url).toBe(`https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=(share:urn%3Ali%3Ashare%3A7325786486870552578)&queryType=IMPRESSION&aggregation=TOTAL`);
    expect(calls[0].headers).toMatchObject({ Authorization: "Bearer tok", "LinkedIn-Version": "202603", "X-Restli-Protocol-Version": "2.0.0" });
  });

  it("leaves clicks null when only LINK_CLICKS is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("LINK_CLICKS") ? json({ message: "no" }, 403) : count(5)));
    expect((await fetchMemberPostFigures("tok", SHARE)).clicks).toBeNull();
  });

  it("raises a rate-limit error that the job can stop on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "slow down" }, 429)));
    const err = await fetchMemberPostFigures("tok", SHARE).catch((e) => e);
    expect(err).toBeInstanceOf(LinkedInApiError);
    expect(err.rateLimited).toBe(true);
  });
});

describe("page post statistics", () => {
  it("maps totalShareStatistics and gives posts LinkedIn left out zero figures", () => {
    const data = { elements: [{ organizationalEntity: "urn:li:organization:9", share: "urn:li:share:1", totalShareStatistics: { clickCount: 78, commentCount: 24, impressionCount: 5287, likeCount: 14, shareCount: 5 } }] };
    const map = parseOrganisationStatistics(data, ["urn:li:share:1", "urn:li:share:2"]);
    expect(map.get("urn:li:share:1")).toEqual({ impressions: 5287, reactions: 14, comments: 24, reshares: 5, clicks: 78 });
    expect(map.get("urn:li:share:2")).toEqual({ impressions: 0, reactions: 0, comments: 0, reshares: 0, clicks: 0 });
  });

  it("asks for shares and ugcPosts as Rest.li lists, in batches of 20", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return json({ elements: [] }); }));
    const posts = Array.from({ length: 21 }, (_, i) => `urn:li:share:${i}`);
    posts.push("urn:li:ugcPost:7");
    const map = await fetchOrganisationPostFigures("tok", "urn:li:organization:9", posts);
    expect(map.size).toBe(22);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A9&shares=List(urn%3Ali%3Ashare%3A0,");
    expect(urls[1]).toContain("shares=List(urn%3Ali%3Ashare%3A20)&ugcPosts=List(urn%3Ali%3AugcPost%3A7)");
  });
});

describe("listing an author's posts", () => {
  it("returns published posts newest first and stops at the first one older than the cut-off", async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return json({ elements: [
        { id: "urn:li:share:1", lifecycleState: "PUBLISHED", publishedAt: now - day },
        { id: "urn:li:share:2", lifecycleState: "DRAFT", publishedAt: now - 2 * day },
        { id: "urn:li:ugcPost:3", lifecycleState: "PUBLISHED", publishedAt: now - 3 * day },
        { id: "urn:li:share:4", lifecycleState: "PUBLISHED", publishedAt: now - 200 * day },
        { id: "urn:li:share:5", lifecycleState: "PUBLISHED", publishedAt: now - 1 },
      ] });
    }));
    const posts = await listAuthorPosts("tok", "urn:li:organization:9", { since: new Date(now - 90 * day) });
    expect(posts.map((p) => p.urn)).toEqual(["urn:li:share:1", "urn:li:ugcPost:3"]);
    expect(posts[0].publishedAt).toBe(new Date(now - day).toISOString());
    expect(urls[0]).toBe("https://api.linkedin.com/rest/posts?author=urn%3Ali%3Aorganization%3A9&q=author&count=50&start=0&sortBy=CREATED");
  });
});
