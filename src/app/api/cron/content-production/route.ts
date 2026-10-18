/** Vercel cron in vercel.json resumes API-only production jobs without a local machine. */
import { NextResponse } from "next/server";
import { runApiProductionBatch } from "@/lib/api-production/runner";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set, so this job will not run" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runApiProductionBatch();
    return NextResponse.json({ ok: result.results.every((item) => item.ok), ...result });
  } catch {
    return NextResponse.json({ error: "Could not recover queued API production. Please retry." }, { status: 500 });
  }
}
