import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { PUBLISHER_SCOPES } from "./app";

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v.replace(/^enc:/, "") }));

import { FRESH_DAYS, HORIZON_DAYS, analyticsRow, dayOfWeek, dueForReading, engagementRate, runLinkedInFigures } from "./figures";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-27T04:00:00Z"); // a Friday
const MONDAY = new Date("2026-11-30T04:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86_400_000).toISOString();

afterEach(() => { vi.unstubAllGlobals(); });

describe("figures rules", () => {
  it("works out the engagement rate from the figures, capped to the column", () => {
    expect(engagementRate({ impressions: 1000, reactions: 30, comments: 5, reshares: 3, clicks: 12 })).toBe(5);
    expect(engagementRate({ impressions: 0, reactions: 3, comments: 0, reshares: 0, clicks: null })).toBe(0);
    expect(engagementRate({ impressions: 1, reactions: 50000, comments: 0, reshares: 0, clicks: 0 })).toBe(999.99);
  });

  it("names the weekday a post went out", () => {
    expect(dayOfWeek("2026-11-27T10:00:00Z")).toBe("Friday");
    expect(dayOfWeek(null)).toBeNull();
  });

  it("reads fresh posts every run and older ones only on Mondays, nothing past the horizon", () => {
    expect(dueForReading(daysAgo(FRESH_DAYS - 1), NOW)).toBe(true);
    expect(dueForReading(daysAgo(30), NOW)).toBe(false);
    expect(dueForReading(daysAgo(30, MONDAY), MONDAY)).toBe(true);
    expect(dueForReading(daysAgo(HORIZON_DAYS + 5, MONDAY), MONDAY)).toBe(false);
    expect(dueForReading(null, NOW)).toBe(true);
  });

  it("builds a row that stores a post with no portal job or piece, and keeps links it knows", () => {
    const f = { impressions: 100, reactions: 4, comments: 1, reshares: 0, clicks: null };
    const outside = analyticsRow(COMPANY, { urn: "urn:li:share:1", publishedAt: "2026-11-24T09:00:00Z" }, f, NOW, 1);
    expect(outside).toMatchObject({ company_id: COMPANY, platform: "linkedin", external_post_id: "urn:li:share:1", impressions: 100, likes: 4, comments: 1, shares: 0, clicks: 0, day_of_week: "Tuesday", posted_at: "2026-11-24T09:00:00Z", poll_count: 1 });
    expect(outside).not.toHaveProperty("publishing_job_id");
    expect(outside).not.toHaveProperty("content_piece_id");
    const portal = analyticsRow(COMPANY, { urn: "urn:li:share:2", publishedAt: null, publishingJobId: "job-1", contentPieceId: "piece-1", postType: "story" }, f, NOW, 2);
    expect(portal).toMatchObject({ publishing_job_id: "job-1", content_piece_id: "piece-1", post_type: "story", poll_count: 2 });
  });

  // Ops reads these columns of post_analytics for its linkedin-metrics source
  // (current_items in the portal's ops_connector_export). A row that carries
  // them all is what makes Ops report examined and updated counts above zero.
  it("fills every column the Ops linkedin-metrics export reads", () => {
    const row = analyticsRow(COMPANY, { urn: "urn:li:share:3", publishedAt: "2026-11-24T09:00:00Z" }, { impressions: 9, reactions: 1, comments: 0, reshares: 0, clicks: 2 }, NOW, 1);
    for (const column of ["company_id", "platform", "external_post_id", "impressions", "likes", "comments", "shares", "clicks", "engagement_rate", "day_of_week", "posted_at", "last_polled_at", "poll_count"]) {
      expect(row, column).toHaveProperty(column);
    }
  });
});

function account(over: Record<string, unknown> = {}) {
  return { id: "acc-1", company_id: COMPANY, platform: "linkedin_personal", account_id: "abc123", access_token_encrypted: "enc:tok", token_expires_at: "2027-01-01T00:00:00Z", platform_metadata: { scope: PUBLISHER_SCOPES }, ...over };
}

describe("runLinkedInFigures", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => json({ elements: [{ count: url.includes("IMPRESSION") ? 500 : 7 }] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("reads a member's portal post, stores it linked to its job, and counts it written", async () => {
    const db = fakeSupabase({
      company_social_accounts: { data: [account()] },
      companies: { data: [{ id: COMPANY, post_pack: "b2b" }] },
      publishing_jobs: { data: [{ id: "job-1", content_piece_id: "piece-1", external_id: "urn:li:share:99", published_at: daysAgo(2), content_pieces: { post_type: "story", content_type: "post" } }] },
      post_analytics: { data: [] },
    });
    const summary = await runLinkedInFigures(db.client as never, NOW);
    expect(summary).toMatchObject({ accounts: 1, posts: 1, written: 1, unchanged: 0, errors: 0, rateLimited: false });
    const upsert = db.calls.find((c) => c.table === "post_analytics" && c.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ external_post_id: "urn:li:share:99", publishing_job_id: "job-1", content_piece_id: "piece-1", post_type: "story", impressions: 500, likes: 7, poll_count: 1 });
    expect(upsert.args[1]).toEqual({ onConflict: "platform,external_post_id" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not rewrite a post whose figures have not moved", async () => {
    const db = fakeSupabase({
      company_social_accounts: { data: [account()] },
      companies: { data: [{ id: COMPANY, post_pack: "b2b" }] },
      publishing_jobs: { data: [{ id: "job-1", content_piece_id: "piece-1", external_id: "urn:li:share:99", published_at: daysAgo(2), content_pieces: null }] },
      post_analytics: { data: [{ external_post_id: "urn:li:share:99", impressions: 500, likes: 7, comments: 7, shares: 7, clicks: 7, poll_count: 3, publishing_job_id: "job-1", content_piece_id: "piece-1" }] },
    });
    const summary = await runLinkedInFigures(db.client as never, NOW);
    expect(summary).toMatchObject({ written: 0, unchanged: 1 });
    expect(db.calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("finds a page's posts published outside the portal and reads them in one statistics call", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/rest/posts?")) return json({ elements: [{ id: "urn:li:share:555", lifecycleState: "PUBLISHED", publishedAt: Date.parse(daysAgo(1)) }] });
      return json({ elements: [{ share: "urn:li:share:555", totalShareStatistics: { impressionCount: 900, likeCount: 12, commentCount: 2, shareCount: 1, clickCount: 30 } }] });
    });
    const db = fakeSupabase({
      company_social_accounts: { data: [account({ id: "page-1", platform: "linkedin_company", account_id: "2414183" })] },
      companies: { data: [{ id: COMPANY, post_pack: "b2b" }] },
      publishing_jobs: { data: [] },
      post_analytics: { data: [] },
    });
    const summary = await runLinkedInFigures(db.client as never, NOW);
    expect(summary).toMatchObject({ accounts: 1, posts: 1, written: 1 });
    const upsert = db.calls.find((c) => c.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ external_post_id: "urn:li:share:555", impressions: 900, likes: 12, clicks: 30 });
    expect(upsert.args[0]).not.toHaveProperty("publishing_job_id");
    expect(String(fetchMock.mock.calls[0][0])).toContain("author=urn%3Ali%3Aorganization%3A2414183");
  });

  it("skips a connection that has expired or lacks the figures scopes, and says so", async () => {
    const db = fakeSupabase({
      company_social_accounts: { data: [
        account({ id: "old", token_expires_at: "2026-01-01T00:00:00Z" }),
        account({ id: "narrow", platform_metadata: { scope: "openid profile w_member_social" } }),
      ] },
      companies: { data: [{ id: COMPANY, post_pack: "b2b" }] },
    });
    const summary = await runLinkedInFigures(db.client as never, NOW);
    expect(summary.accounts).toBe(0);
    expect(summary.skipped.map((s) => s.accountId)).toEqual(["old", "narrow"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops the whole run at the first rate limit", async () => {
    fetchMock.mockImplementation(async () => json({ message: "limit" }, 429));
    const db = fakeSupabase({
      company_social_accounts: { data: [account(), account({ id: "acc-2", account_id: "zzz" })] },
      companies: { data: [{ id: COMPANY, post_pack: "b2b" }] },
      publishing_jobs: { data: [{ id: "job-1", content_piece_id: null, external_id: "urn:li:share:1", published_at: daysAgo(1), content_pieces: null }] },
      post_analytics: { data: [] },
    });
    const summary = await runLinkedInFigures(db.client as never, NOW);
    expect(summary.rateLimited).toBe(true);
    expect(summary.errors).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves hospitality companies alone", async () => {
    const db = fakeSupabase({ company_social_accounts: { data: [account()] }, companies: { data: [{ id: COMPANY, post_pack: "hospitality" }] } });
    const summary = await runLinkedInFigures(db.client as never, NOW);
    expect(summary.accounts).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
