// ============================================================
// Post figures (daily job)
// ============================================================

const API = "https://api.linkedin.com";
const VERSION_HEADERS = { "LinkedIn-Version": "202603", "X-Restli-Protocol-Version": "2.0.0" };
const FIGURES_TIMEOUT_MS = 20_000;

/** A LinkedIn reply that is not success. 429 means the app's daily or per-minute allowance is used up. */
export class LinkedInApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "LinkedInApiError";
  }
  get rateLimited() { return this.status === 429; }
}

export type PostFigures = {
  impressions: number;
  reactions: number;
  comments: number;
  reshares: number;
  /** Link clicks. Null when LinkedIn does not report them for this post. */
  clicks: number | null;
};

export type ListedPost = { urn: string; publishedAt: string | null };

/** What a listing found: the posts inside the window, and the newest post of any age, so an empty window can be told from an empty page. */
export type PostListing = { posts: ListedPost[]; newestPublishedAt: string | null; reachedEnd: boolean };

async function get(accessToken: string, path: string, finder = false): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, ...VERSION_HEADERS, ...(finder ? { "X-RestLi-Method": "FINDER" } : {}) },
    signal: AbortSignal.timeout(FIGURES_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(`LinkedIn request failed (${res.status}): ${body.slice(0, 300)}`, res.status);
  }
  return res.json();
}

/** The Rest.li entity key for a post URN: (share:urn%3Ali%3Ashare%3A1) or (ugc:urn%3Ali%3AugcPost%3A1). */
export function analyticsEntity(postUrn: string): string {
  const kind = postUrn.startsWith("urn:li:ugcPost:") ? "ugc" : "share";
  return `(${kind}:${encodeURIComponent(postUrn)})`;
}

/** The lifetime total in a memberCreatorPostAnalytics reply (one element for TOTAL); 0 when LinkedIn returns none. */
export function sumCounts(data: unknown): number {
  const elements = (data as { elements?: Array<{ count?: unknown }> } | null)?.elements;
  if (!Array.isArray(elements)) return 0;
  return elements.reduce((total, e) => total + (typeof e?.count === "number" && Number.isFinite(e.count) ? e.count : 0), 0);
}

async function memberMetric(accessToken: string, postUrn: string, queryType: string): Promise<number> {
  const path = `/rest/memberCreatorPostAnalytics?q=entity&entity=${analyticsEntity(postUrn)}&queryType=${queryType}&aggregation=TOTAL`;
  return sumCounts(await get(accessToken, path));
}

/**
 * Lifetime figures for one of the member's own posts through the Member Post
 * Analytics API (scope r_member_postAnalytics). The API answers one metric per
 * call, so this is five calls: IMPRESSION, REACTION, COMMENT, RESHARE and
 * LINK_CLICKS. A refusal of LINK_CLICKS alone leaves clicks null.
 */
export async function fetchMemberPostFigures(accessToken: string, postUrn: string): Promise<PostFigures> {
  const impressions = await memberMetric(accessToken, postUrn, "IMPRESSION");
  const reactions = await memberMetric(accessToken, postUrn, "REACTION");
  const comments = await memberMetric(accessToken, postUrn, "COMMENT");
  const reshares = await memberMetric(accessToken, postUrn, "RESHARE");
  let clicks: number | null = null;
  try {
    clicks = await memberMetric(accessToken, postUrn, "LINK_CLICKS");
  } catch (err) {
    if (!(err instanceof LinkedInApiError) || err.rateLimited || err.status === 401) throw err;
  }
  return { impressions, reactions, comments, reshares, clicks };
}

/** The statistics in an organizationalEntityShareStatistics reply, by post URN. Posts LinkedIn leaves out have no activity. */
export function parseOrganisationStatistics(data: unknown, requested: string[]): Map<string, PostFigures> {
  const out = new Map<string, PostFigures>();
  const elements = (data as { elements?: Array<Record<string, unknown>> } | null)?.elements;
  for (const element of Array.isArray(elements) ? elements : []) {
    const urn = (element.share || element.ugcPost) as string | undefined;
    const stats = element.totalShareStatistics as Record<string, unknown> | undefined;
    if (!urn || !stats) continue;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    out.set(urn, { impressions: n(stats.impressionCount), reactions: n(stats.likeCount), comments: n(stats.commentCount), reshares: n(stats.shareCount), clicks: n(stats.clickCount) });
  }
  for (const urn of requested) {
    if (!out.has(urn)) out.set(urn, { impressions: 0, reactions: 0, comments: 0, reshares: 0, clicks: 0 });
  }
  return out;
}

export const ORGANISATION_STATS_BATCH = 20;

/** Lifetime figures for a page's posts, up to ORGANISATION_STATS_BATCH per call (rw_organization_admin). */
export async function fetchOrganisationPostFigures(accessToken: string, organisationUrn: string, postUrns: string[]): Promise<Map<string, PostFigures>> {
  const out = new Map<string, PostFigures>();
  for (let i = 0; i < postUrns.length; i += ORGANISATION_STATS_BATCH) {
    const batch = postUrns.slice(i, i + ORGANISATION_STATS_BATCH);
    const shares = batch.filter((u) => !u.startsWith("urn:li:ugcPost:"));
    const ugcPosts = batch.filter((u) => u.startsWith("urn:li:ugcPost:"));
    const params = [`q=organizationalEntity`, `organizationalEntity=${encodeURIComponent(organisationUrn)}`];
    if (shares.length) params.push(`shares=List(${shares.map(encodeURIComponent).join(",")})`);
    if (ugcPosts.length) params.push(`ugcPosts=List(${ugcPosts.map(encodeURIComponent).join(",")})`);
    const data = await get(accessToken, `/rest/organizationalEntityShareStatistics?${params.join("&")}`);
    for (const [urn, figures] of parseOrganisationStatistics(data, batch)) out.set(urn, figures);
  }
  return out;
}

/**
 * The author's published posts, newest first, from /rest/posts?q=author. A
 * member's posts need r_member_social; a page's posts need r_organization_social.
 * Stops at `maxPosts` or at the first post older than `since`; `newestPublishedAt`
 * is the newest published post LinkedIn returned, whatever its age.
 */
export async function listAuthorPosts(accessToken: string, authorUrn: string, { since, maxPosts = 50 }: { since: Date; maxPosts?: number }): Promise<PostListing> {
  const posts: ListedPost[] = [];
  let newest: number | null = null;
  for (let start = 0; start < 200; start += 50) {
    const data = await get(accessToken, `/rest/posts?author=${encodeURIComponent(authorUrn)}&q=author&count=50&start=${start}&sortBy=CREATED`, true) as { elements?: Array<Record<string, unknown>> };
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    for (const e of elements) {
      const urn = typeof e.id === "string" ? e.id : "";
      if (!urn || e.lifecycleState !== "PUBLISHED") continue;
      const ms = typeof e.publishedAt === "number" ? e.publishedAt : typeof e.createdAt === "number" ? e.createdAt : null;
      if (ms !== null && (newest === null || ms > newest)) newest = ms;
      if (ms !== null && ms < since.getTime()) return { posts, newestPublishedAt: iso(newest), reachedEnd: false };
      posts.push({ urn, publishedAt: ms === null ? null : new Date(ms).toISOString() });
      if (posts.length >= maxPosts) return { posts, newestPublishedAt: iso(newest), reachedEnd: false };
    }
    if (elements.length < 50) return { posts, newestPublishedAt: iso(newest), reachedEnd: true };
  }
  return { posts, newestPublishedAt: iso(newest), reachedEnd: false };
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

/**
 * Whether a post URN still exists on LinkedIn, read with the account's own
 * token. "missing" only for a 404 or a post that is no longer published;
 * anything else (no permission, rate limit, a LinkedIn outage) is "unknown",
 * so a token that cannot read posts never raises a false alarm.
 */
export async function linkedInPostStatus(accessToken: string, postUrn: string): Promise<"live" | "missing" | "unknown"> {
  try {
    const data = (await get(accessToken, `/rest/posts/${encodeURIComponent(postUrn)}`)) as { lifecycleState?: string } | null;
    if (data?.lifecycleState && data.lifecycleState !== "PUBLISHED") return "missing";
    return "live";
  } catch (error) {
    return error instanceof LinkedInApiError && error.status === 404 ? "missing" : "unknown";
  }
}
