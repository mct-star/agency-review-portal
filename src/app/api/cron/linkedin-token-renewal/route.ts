import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runTokenRenewal } from "@/lib/linkedin/token-renewal";
import { alertRecipients, sendOpsAlert } from "@/lib/alerts/ops-alert";
import { appBaseUrl } from "@/lib/reminders/links";

export const maxDuration = 120;

/**
 * GET /api/cron/linkedin-token-renewal
 *
 * Daily. Renews LinkedIn tokens that expire within 14 days, and warns 7 days
 * before expiry and again on expiry through the shared ops alert channel
 * (src/lib/alerts/ops-alert.ts: Slack via SLACK_ALERT_WEBHOOK_URL, and email to
 * ALERT_EMAIL_TO or the admins). See src/lib/linkedin/token-renewal.ts.
 * Fails closed without CRON_SECRET.
 *
 * vercel.json: { "path": "/api/cron/linkedin-token-renewal", "schedule": "0 7 * * *" }
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createAdminSupabaseClient();
    const recipients = await alertRecipients(supabase);
    const summary = await runTokenRenewal(supabase, {
      baseUrl: appBaseUrl(),
      alert: (alert) => sendOpsAlert(alert, recipients),
    });
    console.log(`[LinkedIn renewal] accounts=${summary.accounts} refreshed=${summary.refreshed} failed=${summary.failed} unavailable=${summary.unavailable} noticesSent=${summary.noticesSent} noticesFailed=${summary.noticesFailed}`);
    return NextResponse.json({ ok: summary.failed === 0 && summary.noticesFailed === 0, ...summary });
  } catch (e) {
    console.error("[LinkedIn renewal] run failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "The LinkedIn renewal job failed. Please retry." }, { status: 500 });
  }
}
