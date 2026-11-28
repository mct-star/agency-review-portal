/**
 * The one safe retry for a publishing job.
 *
 * A job is retried once, five minutes later, only when:
 * - the failure is transient (a network error, a 5xx or a 429), and
 * - nothing could have been published: the create-post request never started
 *   (a 5xx after it started may have created the post), and
 * - the job has no external_id and no sibling job for the same piece and
 *   account has one, so a post that is already live is never posted again.
 * A 4xx content error is never retried.
 */

export const RETRY_DELAY_MS = 5 * 60_000;
export const MAX_RETRIES = 1;

export type TransientReason = "rate_limited" | "server_error" | "network";

const NETWORK_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT"]);

/** The HTTP status in a message such as "LinkedIn request failed (503): ...", or null. */
export function statusFromError(error: unknown): number | null {
  const match = error instanceof Error ? error.message.match(/\((\d{3})\)/)?.[1] : undefined;
  return match ? Number(match) : null;
}

/** Why a failure counts as transient, or null when it does not (4xx content errors, refusals, bad payloads). */
export function transientReason(error: unknown): TransientReason | null {
  const status = statusFromError(error);
  if (status !== null) {
    if (status === 429) return "rate_limited";
    if (status >= 500) return "server_error";
    return null;
  }
  if (!(error instanceof Error)) return null;
  if (error.name === "TimeoutError" || error.name === "AbortError") return "network";
  const code = (error as { code?: string }).code || (error.cause as { code?: string } | undefined)?.code;
  if (code && NETWORK_CODES.has(code)) return "network";
  if (error instanceof TypeError && /fetch failed|network|socket/i.test(error.message)) return "network";
  return null;
}

export type RetryFacts = {
  error: unknown;
  /** True once the request that creates the post has been sent. */
  createRequestStarted: boolean;
  retryCount: number;
  /** The job's own external_id, if any. */
  externalId: string | null;
  /** True when another job for the same piece and account already has a live post. */
  siblingPublished: boolean;
};

export type RetryDecision = { retry: true; reason: TransientReason } | { retry: false; why: string };

export function decideRetry(facts: RetryFacts): RetryDecision {
  if (facts.retryCount >= MAX_RETRIES) return { retry: false, why: "already retried once" };
  if (facts.createRequestStarted) return { retry: false, why: "the post request was sent, so the post may be live" };
  if (facts.externalId) return { retry: false, why: "the job already has a post ID" };
  if (facts.siblingPublished) return { retry: false, why: "the post is already live" };
  const reason = transientReason(facts.error);
  if (!reason) return { retry: false, why: "not a transient failure" };
  return { retry: true, reason };
}
