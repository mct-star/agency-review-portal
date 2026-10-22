import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { checkCandidate } from "@/lib/hospitality/coming-up";
import { forPage, listItems, requireVenue, saveCandidates } from "@/lib/hospitality/coming-up-store";
import { todayIn } from "@/lib/hospitality/week";

/**
 * GET /api/hospitality/coming-up?companyId=
 *
 * The venue's Coming up list: everything still to come, plus the last
 * seven days, by date.
 */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = await createAdminSupabaseClient();
  const venue = await requireVenue(supabase, companyId as string);
  if (venue instanceof NextResponse) return venue;
  const today = todayIn(venue.timezone || "Europe/London");
  const items = await listItems(supabase, venue.id, today);
  return NextResponse.json({ today, items: items.map((i) => forPage(i, today)) });
}

/**
 * POST /api/hospitality/coming-up
 * { companyId, kind, title, details?, startsOn, endsOn?, time? }
 *
 * The quick add form. The same checks as the dictation and the uploads:
 * a real date, not over, within 120 days.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = await createAdminSupabaseClient();
  const venue = await requireVenue(supabase, body.companyId as string);
  if (venue instanceof NextResponse) return venue;
  const today = todayIn(venue.timezone || "Europe/London");

  const check = checkCandidate(body, today);
  if (!check.ok) return NextResponse.json({ error: check.reason.replace(/ was left out/, " cannot be added") }, { status: 400 });

  try {
    const saved = await saveCandidates(supabase, venue.id, [check.item], "manual", (access.profile.id as string) ?? null);
    if (saved.added.length === 0) return NextResponse.json({ error: `${check.item.title} is already on the list for that date.` }, { status: 409 });
    return NextResponse.json({ item: forPage(saved.added[0], today) }, { status: 201 });
  } catch (err) {
    console.error("[coming-up] add failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "That could not be saved just now. Please try again." }, { status: 500 });
  }
}
