import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { alertRecipients } from "@/lib/alerts/ops-alert";
import { runLiveCheck, supabaseLiveCheckPorts } from "@/lib/publishing/live-check";

export const maxDuration = 300;

/** Daily: every job published in the last 48 hours must have a stored link and, on LinkedIn, still exist. One summary alert, or nothing. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createAdminSupabaseClient();
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app").replace(/\/+$/, "");
    const recipients = await alertRecipients(supabase);
    return NextResponse.json({ ok: true, ...(await runLiveCheck(supabaseLiveCheckPorts(supabase, baseUrl, recipients))) });
  } catch {
    return NextResponse.json({ error: "The live check could not run." }, { status: 500 });
  }
}
