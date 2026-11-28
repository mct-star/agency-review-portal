import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runTokenRenewal } from "@/lib/linkedin/token-renewal";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_SENDER } from "@/lib/email/sender";
import { appBaseUrl } from "@/lib/reminders/links";

export const maxDuration = 120;

/** Posts to a Slack incoming webhook. Skips cleanly (returns false) when SLACK_ALERT_WEBHOOK_URL is not set. */
async function postSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL?.trim();
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * GET /api/cron/linkedin-token-renewal
 *
 * Daily. Renews LinkedIn tokens that expire within 14 days, and warns by email
 * and Slack 7 days before expiry and again on expiry (see
 * src/lib/linkedin/token-renewal.ts). Fails closed without CRON_SECRET.
 *
 * Optional env: LINKEDIN_ALERT_EMAIL (default: the platform sender address),
 * SLACK_ALERT_WEBHOOK_URL (Slack is skipped when unset).
 *
 * vercel.json: { "path": "/api/cron/linkedin-token-renewal", "schedule": "0 7 * * *" }
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runTokenRenewal(await createAdminSupabaseClient(), {
      baseUrl: appBaseUrl(),
      alertEmail: process.env.LINKEDIN_ALERT_EMAIL?.trim() || DEFAULT_SENDER.address,
      sendEmail: (to, subject, html) => sendEmail({ to, subject, html }),
      postSlack,
    });
    console.log(`[LinkedIn renewal] accounts=${summary.accounts} refreshed=${summary.refreshed} failed=${summary.failed} unavailable=${summary.unavailable} noticesSent=${summary.noticesSent} noticesFailed=${summary.noticesFailed}`);
    return NextResponse.json({ ok: summary.failed === 0 && summary.noticesFailed === 0, ...summary });
  } catch (e) {
    console.error("[LinkedIn renewal] run failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "The LinkedIn renewal job failed. Please retry." }, { status: 500 });
  }
}
