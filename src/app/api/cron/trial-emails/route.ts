import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  sendEmail,
  trialExpiryWarningEmailHtml,
  trialExpiredEmailHtml,
} from "@/lib/email/resend";

/**
 * GET /api/cron/trial-emails
 *
 * Cron job that runs daily to send trial-related emails:
 * 1. Warning email — 2 days before trial ends
 * 2. Expired email — on the day the trial expires
 *
 * Secured by CRON_SECRET header (set in Vercel Cron config).
 * Can also be triggered manually for testing.
 *
 * Vercel Cron config (vercel.json):
 * { "crons": [{ "path": "/api/cron/trial-emails", "schedule": "0 9 * * *" }] }
 */
export async function GET(request: Request) {
  // Verify cron secret (skip in dev)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = await createAdminSupabaseClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app";
  const now = new Date();
  const results: string[] = [];

  // Find companies with trials ending in 2 days (warning)
  const warningDate = new Date(now);
  warningDate.setDate(warningDate.getDate() + 2);
  const warningDateStr = warningDate.toISOString().split("T")[0];

  const { data: warningCompanies } = await supabase
    .from("companies")
    .select("id, name, trial_ends_at, trial_warning_sent")
    .gte("trial_ends_at", `${warningDateStr}T00:00:00`)
    .lte("trial_ends_at", `${warningDateStr}T23:59:59`)
    .is("trial_warning_sent", null);

  for (const company of warningCompanies || []) {
    // Find the company's users
    const { data: users } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("company_id", company.id);

    // Count posts generated and reviews run during trial
    const { count: postsCount } = await supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);

    const { count: reviewsCount } = await supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .not("regulatory_score", "is", null);

    for (const user of users || []) {
      try {
        await sendEmail({
          to: user.email,
          subject: `Your AGENCY Pro trial ends in 2 days — ${company.name}`,
          html: trialExpiryWarningEmailHtml({
            userName: user.full_name || "there",
            companyName: company.name,
            daysLeft: 2,
            upgradeUrl: `${baseUrl}/setup/${company.id}#billing`,
            dashboardUrl: `${baseUrl}/dashboard`,
            postsGenerated: postsCount || 0,
            reviewsRun: reviewsCount || 0,
          }),
        });
        results.push(`Warning sent to ${user.email} (${company.name})`);
      } catch (err) {
        results.push(`Warning FAILED for ${user.email}: ${err}`);
      }
    }

    // Mark warning as sent
    await supabase
      .from("companies")
      .update({ trial_warning_sent: now.toISOString() })
      .eq("id", company.id);
  }

  // Find companies with trials that expired today
  const todayStr = now.toISOString().split("T")[0];

  const { data: expiredCompanies } = await supabase
    .from("companies")
    .select("id, name, trial_ends_at, trial_expired_sent")
    .gte("trial_ends_at", `${todayStr}T00:00:00`)
    .lte("trial_ends_at", `${todayStr}T23:59:59`)
    .is("trial_expired_sent", null);

  for (const company of expiredCompanies || []) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("company_id", company.id);

    const { count: postsCount } = await supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);

    for (const user of users || []) {
      try {
        await sendEmail({
          to: user.email,
          subject: `Your AGENCY Pro trial has ended — ${company.name}`,
          html: trialExpiredEmailHtml({
            userName: user.full_name || "there",
            companyName: company.name,
            upgradeUrl: `${baseUrl}/setup/${company.id}#billing`,
            postsGenerated: postsCount || 0,
          }),
        });
        results.push(`Expired sent to ${user.email} (${company.name})`);
      } catch (err) {
        results.push(`Expired FAILED for ${user.email}: ${err}`);
      }
    }

    // Mark expired email as sent
    await supabase
      .from("companies")
      .update({ trial_expired_sent: now.toISOString() })
      .eq("id", company.id);
  }

  return NextResponse.json({
    processed: results.length,
    results,
    warningCompanies: warningCompanies?.length || 0,
    expiredCompanies: expiredCompanies?.length || 0,
  });
}
