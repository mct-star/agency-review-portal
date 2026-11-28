import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { alertRecipients } from "@/lib/alerts/ops-alert";
import { runPublishingWatch, supabasePorts } from "@/lib/publishing/job-alerts";

export const maxDuration = 60;

/**
 * Every five minutes: alerts (once per job and kind) on failed jobs, failed
 * first comments, and jobs still unpublished 15 minutes after their time.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createAdminSupabaseClient();
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app").replace(/\/+$/, "");
    const recipients = await alertRecipients(supabase);
    return NextResponse.json({ ok: true, ...(await runPublishingWatch(supabasePorts(supabase, baseUrl, recipients))) });
  } catch {
    return NextResponse.json({ error: "The publishing watch could not run." }, { status: 500 });
  }
}
