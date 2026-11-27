import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runLinkedInFigures } from "@/lib/linkedin/figures";

export const maxDuration = 300;

/**
 * GET /api/cron/linkedin-figures
 *
 * The daily LinkedIn figures job (see src/lib/linkedin/figures.ts). Reads the
 * figures for each active LinkedIn connection and stores them in
 * post_analytics, which Ops drains as its linkedin-metrics source.
 *
 * Fails closed: it refuses to run unless CRON_SECRET is set and matches.
 *
 * vercel.json: { "path": "/api/cron/linkedin-figures", "schedule": "30 3 * * *" }
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runLinkedInFigures(await createAdminSupabaseClient());
    console.log(`[LinkedIn figures] accounts=${summary.accounts} posts=${summary.posts} written=${summary.written} unchanged=${summary.unchanged} errors=${summary.errors} rateLimited=${summary.rateLimited} skipped=${summary.skipped.length}`);
    return NextResponse.json({ ok: summary.errors === 0, ...summary });
  } catch (e) {
    console.error("[LinkedIn figures] run failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not read the LinkedIn figures. Please retry." }, { status: 500 });
  }
}
