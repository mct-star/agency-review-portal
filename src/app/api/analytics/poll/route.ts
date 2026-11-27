import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runLinkedInFigures } from "@/lib/linkedin/figures";

export const maxDuration = 300;

/** Admin "poll now": runs the same job as the daily cron (src/lib/linkedin/figures.ts). */
export async function POST() {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const summary = await runLinkedInFigures(await createAdminSupabaseClient());
  return NextResponse.json({
    ...summary,
    polled: summary.written + summary.unchanged,
    total: summary.posts,
    message: summary.accounts === 0 && summary.skipped.length
      ? "LinkedIn needs reconnecting before figures can be read"
      : summary.posts === 0 ? `No recent LinkedIn posts to poll. ${summary.perAccount.map((a) => `${a.name || a.platform}: ${a.reason}`).join("; ")}` : undefined,
  });
}
