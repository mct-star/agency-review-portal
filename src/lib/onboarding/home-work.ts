import type { createServerSupabaseClient } from "@/lib/supabase/server";

/** Count approved social/video pieces without a publishing attempt; failures stay in the publishing queue for recovery. */
export async function loadApprovedUnqueued(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<number | null> {
  const results = await Promise.allSettled([
    supabase.from("content_pieces").select("id", { count: "exact" }).eq("company_id", companyId).eq("approval_status", "approved")
      .in("content_type", ["social_post", "video", "video_script"]),
    supabase.from("publishing_jobs").select("content_piece_id, status", { count: "exact" }).eq("company_id", companyId),
  ]);
  if (results.some((result) => result.status === "rejected" || result.value.error)) return null;
  const [pieces, jobs] = results.map((result) => result.status === "fulfilled" ? result.value.data : null);
  if (!pieces || !jobs) return null;
  // PostgREST caps returned rows. An incomplete list cannot establish which pieces were never queued.
  if (results.some((result) => result.status !== "fulfilled" || result.value.count !== (result.value.data || []).length)) return null;
  // Any recorded attempt stays out, including cancelled or uncertain outcomes.
  // A fresh publish action belongs in Publish, where the full queue is visible.
  const attempted = new Set((jobs as Array<{ content_piece_id: string | null }>).map((job) => job.content_piece_id));
  return (pieces as Array<{ id: string }>).filter((piece) => !attempted.has(piece.id)).length;
}
