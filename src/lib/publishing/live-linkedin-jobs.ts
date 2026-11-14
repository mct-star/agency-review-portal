import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which pieces already have a LinkedIn job that is, or may be, live
 * (14 Nov 2026). Deploy week reports these as already in the queue, and the
 * scheduler export leaves them out of LinkedIn on request, so the same post
 * never reaches LinkedIn twice.
 *
 * Live means queued, scheduled, running or published, on any of the
 * company's LinkedIn accounts. A failed job whose outcome was uncertain
 * counts too: LinkedIn may have accepted the post. A plainly failed job
 * does not: nothing went out.
 */

export interface LinkedInJobRow {
  content_piece_id: string | null;
  status: string;
  response_payload?: { outcome_uncertain?: boolean } | null;
}

export type LiveLinkedInStatus = "queued" | "scheduled" | "running" | "published" | "uncertain";

const LIVE = new Set(["queued", "scheduled", "running", "published"]);

/** The job's live status, or null when it cannot have posted and will not. Pure. */
export function liveLinkedInStatus(job: LinkedInJobRow): LiveLinkedInStatus | null {
  if (LIVE.has(job.status)) return job.status as LiveLinkedInStatus;
  if (job.status === "failed" && job.response_payload?.outcome_uncertain) return "uncertain";
  return null;
}

const RANK: Record<LiveLinkedInStatus, number> = { published: 5, uncertain: 4, running: 3, scheduled: 2, queued: 1 };

/**
 * Live LinkedIn jobs per piece, for one company's pieces only. Returns null
 * when the queue could not be read: callers must then not queue or export
 * as if nothing were there.
 */
export async function liveLinkedInJobsByPiece(
  supabase: SupabaseClient,
  companyId: string,
  pieceIds: string[],
): Promise<Map<string, LiveLinkedInStatus> | null> {
  const live = new Map<string, LiveLinkedInStatus>();
  if (!pieceIds.length) return live;
  const { data, error } = await supabase.from("publishing_jobs")
    .select("content_piece_id, status, response_payload")
    .eq("company_id", companyId).eq("target_platform", "linkedin_personal")
    .in("content_piece_id", pieceIds);
  if (error) return null;
  for (const job of (data || []) as LinkedInJobRow[]) {
    const status = job.content_piece_id ? liveLinkedInStatus(job) : null;
    if (!status || !job.content_piece_id) continue;
    const seen = live.get(job.content_piece_id);
    if (!seen || RANK[status] > RANK[seen]) live.set(job.content_piece_id, status);
  }
  return live;
}

/** What Deploy week says about a piece with a live job. */
export function liveLinkedInNote(status: LiveLinkedInStatus): string {
  switch (status) {
    case "published": return "Already published on LinkedIn.";
    case "uncertain": return "LinkedIn may already have this post. Check the account before doing anything else with it.";
    case "running": return "Being posted to LinkedIn now.";
    default: return "Already in the LinkedIn queue.";
  }
}
