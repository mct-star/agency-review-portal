import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkCandidate, readBuildUp } from "@/lib/hospitality/coming-up";
import { authoriseItem, forPage, ITEM_COLUMNS, requireVenue, toItem } from "@/lib/hospitality/coming-up-store";
import { todayIn } from "@/lib/hospitality/week";

const EDITABLE = ["kind", "title", "details", "startsOn", "endsOn", "time"] as const;

/**
 * PATCH /api/hospitality/coming-up/[id]
 * { kind?, title?, details?, startsOn?, endsOn?, time?, buildUp?: { week?, two_days?, day_of? }, status?: "cancelled" | "active" }
 *
 * Edit an item, switch its build-up posts on or off, or cancel it. An edit
 * to the item itself is checked like a new one; switching and cancelling are not.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authoriseItem(id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const item = access.item;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const supabase = await createAdminSupabaseClient();
  const venue = await requireVenue(supabase, item.company_id);
  if (venue instanceof NextResponse) return venue;
  const today = todayIn(venue.timezone || "Europe/London");

  const update: Record<string, unknown> = {};
  if (EDITABLE.some((k) => k in body)) {
    const merged = {
      kind: "kind" in body ? body.kind : item.kind,
      title: "title" in body ? body.title : item.title,
      details: "details" in body ? body.details : item.details,
      startsOn: "startsOn" in body ? body.startsOn : item.starts_on,
      endsOn: "endsOn" in body ? body.endsOn : item.ends_on,
      time: "time" in body ? body.time : item.start_time,
    };
    const check = checkCandidate(merged, today);
    if (!check.ok) return NextResponse.json({ error: check.reason.replace(/ was left out/, " cannot be saved") }, { status: 400 });
    if ("time" in body && body.time && !check.item.time) {
      return NextResponse.json({ error: "Write the time as 19:30 or 7.30pm." }, { status: 400 });
    }
    Object.assign(update, {
      kind: check.item.kind,
      title: check.item.title,
      details: check.item.details,
      starts_on: check.item.startsOn,
      ends_on: check.item.endsOn,
      start_time: check.item.time,
    });
  }
  if (body.buildUp && typeof body.buildUp === "object") {
    const b = body.buildUp as Record<string, unknown>;
    const current = readBuildUp(item.build_up);
    update.build_up = {
      week: typeof b.week === "boolean" ? b.week : current.week,
      two_days: typeof b.two_days === "boolean" ? b.two_days : current.two_days,
      day_of: typeof b.day_of === "boolean" ? b.day_of : current.day_of,
    };
  }
  if ("status" in body) {
    if (body.status !== "cancelled" && body.status !== "active") return NextResponse.json({ error: "status is cancelled or active" }, { status: 400 });
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await supabase
    .from("venue_calendar_items")
    .update(update)
    .eq("id", item.id)
    .eq("company_id", item.company_id)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "That change could not be saved. Please try again." }, { status: 500 });
  return NextResponse.json({ item: forPage(toItem(data as Record<string, unknown>), today) });
}
