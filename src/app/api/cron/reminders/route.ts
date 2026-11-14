import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { reminderMode, runReminders } from "@/lib/reminders/run";

export const maxDuration = 120;

/**
 * GET /api/cron/reminders
 *
 * The hourly review-reminder job. For each company with a cadence it works
 * out which reminders are due now and, when switched on, emails them once
 * (see src/lib/reminders/run.ts).
 *
 * Fails closed: it refuses to run unless CRON_SECRET is set and matches.
 *
 * Safety switch, read straight after the secret check and before any
 * database access: REMINDERS_MODE.
 *   unset or any other value  returns at once, reads and sends nothing.
 *   dry_run                   works out what is due and returns counts. Writes
 *                             nothing, sends nothing.
 *   send                      sends.
 *
 * vercel.json: { "path": "/api/cron/reminders", "schedule": "0 * * * *" }
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = reminderMode(process.env.REMINDERS_MODE);
  if (mode === "off") {
    return NextResponse.json({ ok: true, skipped: true, reason: "REMINDERS_MODE is not dry_run or send" });
  }

  try {
    const supabase = await createAdminSupabaseClient();
    const summary = await runReminders(supabase, mode, new Date());
    return NextResponse.json({ ok: summary.failures.length === 0, ...summary });
  } catch {
    return NextResponse.json({ error: "Could not run the reminders. Please retry." }, { status: 500 });
  }
}
