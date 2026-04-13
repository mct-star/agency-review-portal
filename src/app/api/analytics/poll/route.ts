import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { fetchPostMetrics } from "@/lib/linkedin/analytics";

export const maxDuration = 60;

export async function POST() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await createAdminSupabaseClient();

  // Find recent published posts with LinkedIn URNs
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: jobs } = await supabase
    .from("publishing_jobs")
    .select(
      "id, content_piece_id, company_id, external_id, published_at, social_account_id, content_pieces(post_type, content_type)"
    )
    .eq("status", "published")
    .in("target_platform", ["linkedin_personal", "linkedin_company"])
    .gte("published_at", sevenDaysAgo)
    .not("external_id", "is", null);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({
      polled: 0,
      message: "No recent LinkedIn posts to poll",
    });
  }

  // Get LinkedIn access tokens per social account
  const tokenCache = new Map<string, string>();
  let polled = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      const accountId = job.social_account_id;
      if (!accountId) continue;

      let accessToken = tokenCache.get(accountId);

      if (!accessToken) {
        const { data: account } = await supabase
          .from("company_social_accounts")
          .select("access_token_encrypted")
          .eq("id", accountId)
          .eq("is_active", true)
          .not("access_token_encrypted", "is", null)
          .single();

        if (account?.access_token_encrypted) {
          accessToken = decrypt(account.access_token_encrypted);
          tokenCache.set(accountId, accessToken);
        }
      }

      if (!accessToken) continue;

      const metrics = await fetchPostMetrics(accessToken, job.external_id!);
      const totalEngagement =
        metrics.likes + metrics.comments + metrics.shares;
      // Rough engagement rate estimate (engagement / estimated impressions)
      const engagementRate =
        totalEngagement > 0
          ? (totalEngagement / Math.max(1, metrics.likes * 10)) * 100
          : 0;

      // Get content piece data
      const piece = job.content_pieces as unknown as Record<string, string> | null;

      // Calculate day of week from published_at
      const publishedDate = job.published_at
        ? new Date(job.published_at)
        : null;
      const dayOfWeek = publishedDate
        ? [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ][publishedDate.getUTCDay()]
        : null;

      // Check if analytics row already exists for this job
      const { data: existing } = await supabase
        .from("post_analytics")
        .select("id, poll_count")
        .eq("publishing_job_id", job.id)
        .single();

      if (existing) {
        // Update existing row
        await supabase
          .from("post_analytics")
          .update({
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
            engagement_rate: Math.round(engagementRate * 100) / 100,
            last_polled_at: new Date().toISOString(),
            poll_count: (existing.poll_count || 0) + 1,
          })
          .eq("id", existing.id);
      } else {
        // Insert new row
        await supabase.from("post_analytics").insert({
          content_piece_id: job.content_piece_id,
          publishing_job_id: job.id,
          company_id: job.company_id,
          platform: "linkedin",
          external_post_id: job.external_id,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          engagement_rate: Math.round(engagementRate * 100) / 100,
          post_type: piece?.post_type || piece?.content_type || null,
          day_of_week: dayOfWeek,
          posted_at: job.published_at,
          last_polled_at: new Date().toISOString(),
          poll_count: 1,
        });
      }

      polled++;
    } catch (err) {
      console.error(`Analytics poll failed for job ${job.id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({ polled, errors, total: jobs.length });
}
