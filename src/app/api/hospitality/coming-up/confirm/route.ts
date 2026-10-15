import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { validateUpcoming } from "@/lib/hospitality/coming-up";
import { forPage, requireVenue, saveCandidates } from "@/lib/hospitality/coming-up-store";
import { todayIn } from "@/lib/hospitality/week";

/**
 * POST /api/hospitality/coming-up/confirm
 * { companyId, items: [{ kind, title, details, startsOn, endsOn, time }] }
 *
 * Saves the items the person ticked on the upload review list. They are
 * checked again here: the list came back from the browser.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = await createAdminSupabaseClient();
  const venue = await requireVenue(supabase, body.companyId as string);
  if (venue instanceof NextResponse) return venue;

  if (!Array.isArray(body.items) || body.items.length === 0) return NextResponse.json({ error: "Tick at least one to add." }, { status: 400 });
  if (body.items.length > 100) return NextResponse.json({ error: "That is too many at once. Add up to 100." }, { status: 400 });

  const today = todayIn(venue.timezone || "Europe/London");
  const checked = validateUpcoming(body.items, today);
  try {
    const saved = await saveCandidates(supabase, venue.id, checked.items, "upload", (access.profile.id as string) ?? null);
    const notes = [...checked.notes, ...saved.already.map((t) => `${t} was already on the list.`)];
    return NextResponse.json({ added: saved.added.map((i) => forPage(i, today)), notes });
  } catch (err) {
    console.error("[coming-up] confirm failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "That could not be saved just now. Please try again." }, { status: 500 });
  }
}
