import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DIRECT_SOCIAL_JOB_MARKER, DIRECT_SOCIAL_PLATFORMS } from "@/lib/publishing/direct-social";
import { processDirectSocialJob } from "@/lib/publishing/direct-social-worker";
import { getDirectSocialAdapter } from "@/lib/publishing/adapter-registry";

export const maxDuration = 300;

/** Claims and dispatches one due, version-tagged direct social job without touching legacy publishing queues. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const now = new Date().toISOString();
  await supabase.from("bluesky_oauth_states").delete().lt("expires_at", now);
  const staleBefore = Date.now() - 15 * 60_000;
  const { data: running } = await supabase.from("publishing_jobs").select("id,company_id,response_payload")
    .in("target_platform", [...DIRECT_SOCIAL_PLATFORMS]).contains("publish_payload", { provider: DIRECT_SOCIAL_JOB_MARKER }).eq("status", "running").limit(50);
  let uncertain = 0;
  for (const job of running || []) {
    const startedAt = Date.parse((job.response_payload as { attempt_started_at?: string } | null)?.attempt_started_at || "");
    if (Number.isFinite(startedAt) && startedAt < staleBefore) {
      const { data } = await supabase.from("publishing_jobs").update({ status: "failed", error_message: "The provider may have accepted this post. Check the account before taking further action.", response_payload: { outcome_uncertain: true, manual_check_required: true } })
        .eq("id", job.id).eq("company_id", job.company_id).eq("status", "running").select("id");
      uncertain += data?.length || 0;
    }
  }

  const { data: candidate, error } = await supabase.from("publishing_jobs").select("id,company_id,content_piece_id,social_account_id,triggered_by,target_platform,publish_payload")
    .in("target_platform", [...DIRECT_SOCIAL_PLATFORMS]).contains("publish_payload", { provider: DIRECT_SOCIAL_JOB_MARKER })
    .in("status", ["queued", "scheduled"]).or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("scheduled_for", { ascending: true, nullsFirst: true }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read the direct social publishing queue." }, { status: 500 });
  if (!candidate) return NextResponse.json({ ok: true, claimed: 0, published: 0, failed: 0, uncertain });

  const { data: claimed } = await supabase.from("publishing_jobs").update({ status: "running", response_payload: { attempt_started_at: new Date().toISOString() } })
    .eq("id", candidate.id).eq("company_id", candidate.company_id).in("target_platform", [...DIRECT_SOCIAL_PLATFORMS])
    .contains("publish_payload", { provider: DIRECT_SOCIAL_JOB_MARKER }).in("status", ["queued", "scheduled"])
    .select("id,company_id,content_piece_id,social_account_id,triggered_by,target_platform,publish_payload").maybeSingle();
  if (!claimed) return NextResponse.json({ ok: true, claimed: 0, published: 0, failed: 0, uncertain });
  const result = await processDirectSocialJob(supabase, claimed, getDirectSocialAdapter);
  return NextResponse.json({ ok: true, claimed: 1, published: result === "published" ? 1 : 0, failed: result === "failed" ? 1 : 0, uncertain: uncertain + (result === "uncertain" ? 1 : 0) });
}
