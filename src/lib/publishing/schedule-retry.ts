import type { SupabaseClient } from "@supabase/supabase-js";
import { RETRY_DELAY_MS, decideRetry } from "./retry";

type RetryJob = {
  id: string;
  company_id: string;
  content_piece_id: string | null;
  social_account_id: string | null;
  publish_payload: Record<string, unknown>;
};

/**
 * Puts a failed, claimed job back on the queue for one retry five minutes on,
 * when decideRetry allows it. Returns true when the job was rescheduled.
 *
 * The no-duplicate guard is checked twice: the facts are read first so the
 * decision is explicit, and the update itself only applies while the job is
 * still running with no external_id, so a job that has since recorded a post
 * is never put back on the queue.
 */
export async function scheduleRetry(supabase: SupabaseClient, job: RetryJob, error: unknown, createRequestStarted: boolean, now = new Date()): Promise<boolean> {
  try {
    const retryCount = Number(job.publish_payload?.retry_count) || 0;
    const { data: own } = await supabase.from("publishing_jobs").select("external_id").eq("id", job.id).eq("company_id", job.company_id).maybeSingle();
    let siblingPublished = false;
    if (job.content_piece_id && job.social_account_id) {
      const { data: siblings } = await supabase.from("publishing_jobs").select("id")
        .eq("company_id", job.company_id).eq("content_piece_id", job.content_piece_id).eq("social_account_id", job.social_account_id)
        .eq("status", "published").not("external_id", "is", null).neq("id", job.id).limit(1);
      siblingPublished = (siblings || []).length > 0;
    }
    const decision = decideRetry({ error, createRequestStarted, retryCount, externalId: (own as { external_id?: string | null } | null)?.external_id || null, siblingPublished });
    if (!decision.retry) return false;
    const { data: updated } = await supabase.from("publishing_jobs").update({
      status: "scheduled",
      scheduled_for: new Date(now.getTime() + RETRY_DELAY_MS).toISOString(),
      publish_payload: { ...job.publish_payload, retry_count: retryCount + 1 },
      error_message: null,
      response_payload: { retry_reason: decision.reason, retry_scheduled_at: now.toISOString() },
    }).eq("id", job.id).eq("company_id", job.company_id).eq("status", "running").is("external_id", null).select("id");
    return (updated || []).length > 0;
  } catch {
    // If the retry cannot be arranged the job stays failed and is alerted on.
    return false;
  }
}
