import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runWeatherPosts } from "@/lib/weather/draft-post";

export const maxDuration = 120;

/**
 * GET /api/cron/weather-posts
 *
 * Drafts the daily weather post for every hospitality company that has it
 * switched on. Each draft waits for a company user to approve it. Safe to
 * call more than once a day: a date already drafted is skipped.
 *
 * Unlike the older trial-email job, this one refuses to run unless
 * CRON_SECRET is set and matches. It writes with an AI provider and sends
 * email, so an open endpoint would be a way to run up cost.
 *
 * vercel.json: { "path": "/api/cron/weather-posts", "schedule": "0 4 * * *" }
 * (04:00 UTC, so the draft is ready before a 07:00 post time all year).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Optional ?companyId=<uuid> limits a manual run to one company.
  const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
  if (companyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return NextResponse.json({ error: "companyId must be a uuid" }, { status: 400 });
  }
  const supabase = await createAdminSupabaseClient();
  const results = await runWeatherPosts(supabase, new Date(), { companyId });
  return NextResponse.json({
    ok: true,
    drafted: results.filter((r) => r.status === "drafted").length,
    results,
  });
}
