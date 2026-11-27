import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { canListMemberPosts, canReadMemberAnalytics, canReadOrganisationFigures } from "./app";
import {
  LinkedInApiError,
  fetchMemberPostFigures,
  fetchOrganisationPostFigures,
  listAuthorPosts,
  type PostFigures,
} from "./analytics";

/**
 * The daily LinkedIn figures job: for each active LinkedIn connection, find the
 * recent posts, read each one's lifetime figures from LinkedIn and store them
 * in post_analytics, which the Ops "linkedin-metrics" export drains.
 *
 * Which posts can be found:
 * - Posts this portal published (publishing_jobs.external_id), always.
 * - Every post by a page (author = the page, r_organization_social), including
 *   those published elsewhere, such as through Metricool.
 * - Every post by a member only when the grant already carries r_member_social,
 *   which LinkedIn restricts to approved apps. Without it, a member's posts
 *   published outside the portal cannot be listed.
 *
 * Staying inside the Development tier allowance (LinkedIn publishes no fixed
 * figure; the app's daily usage shows in the developer portal):
 * - A member's post costs 5 calls (one per metric), a page's posts 1 call per 20.
 * - At most MAX_POSTS_PER_ACCOUNT posts per account per run, newest first.
 * - Posts up to FRESH_DAYS old are read every run; posts up to HORIZON_DAYS old
 *   only on Mondays. Older posts are not read.
 * - Calls run one at a time with a pause, and the first 429 ends the run.
 * - A row is written only when its figures changed, so the Ops export is not
 *   re-queued for posts that have gone quiet.
 */

export const MAX_POSTS_PER_ACCOUNT = 40;
export const FRESH_DAYS = 14;
export const HORIZON_DAYS = 90;
const CALL_PAUSE_MS = 250;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type KnownPost = {
  urn: string;
  publishedAt: string | null;
  publishingJobId?: string;
  contentPieceId?: string | null;
  postType?: string | null;
};

export type FiguresSummary = {
  accounts: number;
  posts: number;
  written: number;
  unchanged: number;
  errors: number;
  rateLimited: boolean;
  skipped: Array<{ accountId: string; reason: string }>;
};

/** Reactions, comments, reshares and clicks as a percentage of impressions, to the column's 2 places. */
export function engagementRate(f: PostFigures): number {
  if (f.impressions <= 0) return 0;
  const rate = ((f.reactions + f.comments + f.reshares + (f.clicks ?? 0)) / f.impressions) * 100;
  return Math.min(999.99, Math.round(rate * 100) / 100);
}

export function dayOfWeek(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) ? DAYS[new Date(t).getUTCDay()] : null;
}

/** Fresh posts every run, older ones within the horizon on Mondays, nothing beyond. A post with no date is read. */
export function dueForReading(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return true;
  const age = (now.getTime() - Date.parse(publishedAt)) / DAY_MS;
  if (!Number.isFinite(age)) return true;
  if (age <= FRESH_DAYS) return true;
  return age <= HORIZON_DAYS && now.getUTCDay() === 1;
}

/** The row to write for one post: only the columns it knows, so a re-read never blanks a link it has already stored. */
export function analyticsRow(companyId: string, post: KnownPost, f: PostFigures, now: Date, pollCount: number) {
  return {
    company_id: companyId,
    platform: "linkedin",
    external_post_id: post.urn,
    impressions: f.impressions,
    likes: f.reactions,
    comments: f.comments,
    shares: f.reshares,
    clicks: f.clicks ?? 0,
    engagement_rate: engagementRate(f),
    day_of_week: dayOfWeek(post.publishedAt),
    posted_at: post.publishedAt,
    last_polled_at: now.toISOString(),
    poll_count: pollCount,
    ...(post.publishingJobId ? { publishing_job_id: post.publishingJobId } : {}),
    ...(post.contentPieceId ? { content_piece_id: post.contentPieceId } : {}),
    ...(post.postType ? { post_type: post.postType } : {}),
  };
}

type StoredRow = { external_post_id: string; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; clicks: number | null; poll_count: number | null; publishing_job_id: string | null; content_piece_id: string | null };

function unchanged(row: StoredRow | undefined, f: PostFigures, post: KnownPost): boolean {
  if (!row) return false;
  const sameFigures = row.impressions === f.impressions && row.likes === f.reactions && row.comments === f.comments
    && row.shares === f.reshares && row.clicks === (f.clicks ?? 0);
  const learnsLink = (!!post.publishingJobId && !row.publishing_job_id) || (!!post.contentPieceId && !row.content_piece_id);
  return sameFigures && !learnsLink;
}

type Account = { id: string; company_id: string; platform: string; account_id: string; access_token_encrypted: string | null; token_expires_at: string | null; platform_metadata: Record<string, unknown> | null };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function knownPosts(supabase: SupabaseClient, account: Account, since: Date): Promise<Map<string, KnownPost>> {
  const posts = new Map<string, KnownPost>();
  const { data: jobs } = await supabase
    .from("publishing_jobs")
    .select("id, content_piece_id, external_id, published_at, content_pieces(post_type, content_type)")
    .eq("company_id", account.company_id)
    .eq("social_account_id", account.id)
    .eq("status", "published")
    .gte("published_at", since.toISOString())
    .not("external_id", "is", null);
  for (const job of (jobs || []) as unknown as Array<{ id: string; content_piece_id: string | null; external_id: string; published_at: string | null; content_pieces: { post_type?: string; content_type?: string } | null }>) {
    if (!job.external_id.startsWith("urn:li:")) continue;
    posts.set(job.external_id, {
      urn: job.external_id,
      publishedAt: job.published_at,
      publishingJobId: job.id,
      contentPieceId: job.content_piece_id,
      postType: job.content_pieces?.post_type || job.content_pieces?.content_type || null,
    });
  }
  return posts;
}

/** Finds, reads and stores the figures for every active LinkedIn connection. */
export async function runLinkedInFigures(supabase: SupabaseClient, now = new Date()): Promise<FiguresSummary> {
  const summary: FiguresSummary = { accounts: 0, posts: 0, written: 0, unchanged: 0, errors: 0, rateLimited: false, skipped: [] };
  const since = new Date(now.getTime() - HORIZON_DAYS * DAY_MS);

  const { data: accountRows } = await supabase
    .from("company_social_accounts")
    .select("id, company_id, platform, account_id, access_token_encrypted, token_expires_at, platform_metadata")
    .in("platform", ["linkedin_personal", "linkedin_company"])
    .eq("is_active", true)
    .not("access_token_encrypted", "is", null)
    .order("platform", { ascending: false });
  const accounts = (accountRows || []) as Account[];
  if (!accounts.length) return summary;

  const { data: companyRows } = await supabase.from("companies").select("id, post_pack").in("id", [...new Set(accounts.map((a) => a.company_id))]);
  const hospitality = new Set(((companyRows || []) as Array<{ id: string; post_pack: string | null }>).filter((c) => c.post_pack === "hospitality").map((c) => c.id));

  for (const account of accounts) {
    if (summary.rateLimited) break;
    if (hospitality.has(account.company_id)) continue;
    const scope = typeof account.platform_metadata?.scope === "string" ? account.platform_metadata.scope : "";
    const isPage = account.platform === "linkedin_company";
    const expiry = account.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) { summary.skipped.push({ accountId: account.id, reason: "token expired, reconnect" }); continue; }
    if (isPage ? !canReadOrganisationFigures(scope) : !canReadMemberAnalytics(scope)) { summary.skipped.push({ accountId: account.id, reason: "connection lacks the figures scopes, reconnect" }); continue; }
    summary.accounts++;

    try {
      const accessToken = decrypt(account.access_token_encrypted!);
      const owner = isPage ? `urn:li:organization:${account.account_id}` : `urn:li:person:${account.account_id}`;
      const posts = await knownPosts(supabase, account, since);
      if (isPage || canListMemberPosts(scope)) {
        for (const listed of await listAuthorPosts(accessToken, owner, { since, maxPosts: MAX_POSTS_PER_ACCOUNT })) {
          if (!posts.has(listed.urn)) posts.set(listed.urn, { urn: listed.urn, publishedAt: listed.publishedAt });
        }
      }
      const due = [...posts.values()]
        .filter((p) => dueForReading(p.publishedAt, now))
        .sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0))
        .slice(0, MAX_POSTS_PER_ACCOUNT);
      if (!due.length) continue;
      summary.posts += due.length;

      const { data: stored } = await supabase.from("post_analytics").select("external_post_id, impressions, likes, comments, shares, clicks, poll_count, publishing_job_id, content_piece_id")
        .eq("company_id", account.company_id).eq("platform", "linkedin").in("external_post_id", due.map((p) => p.urn));
      const rows = new Map(((stored || []) as StoredRow[]).map((r) => [r.external_post_id, r]));

      const figures = new Map<string, PostFigures>();
      if (isPage) {
        for (const [urn, f] of await fetchOrganisationPostFigures(accessToken, owner, due.map((p) => p.urn))) figures.set(urn, f);
      }

      for (const post of due) {
        try {
          let f = figures.get(post.urn);
          if (!f) {
            f = await fetchMemberPostFigures(accessToken, post.urn);
            await pause(CALL_PAUSE_MS);
          }
          const existing = rows.get(post.urn);
          if (unchanged(existing, f, post)) { summary.unchanged++; continue; }
          const { error } = await supabase.from("post_analytics")
            .upsert(analyticsRow(account.company_id, post, f, now, (existing?.poll_count || 0) + 1), { onConflict: "platform,external_post_id" });
          if (error) throw new Error(error.message);
          summary.written++;
        } catch (err) {
          if (err instanceof LinkedInApiError && err.rateLimited) { summary.rateLimited = true; break; }
          summary.errors++;
          console.error(`[LinkedIn figures] post ${post.urn} failed:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      if (err instanceof LinkedInApiError && err.rateLimited) { summary.rateLimited = true; break; }
      summary.errors++;
      console.error(`[LinkedIn figures] account ${account.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return summary;
}
