import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany, type AccessProfile } from "@/lib/auth/permissions";
import type { Refusal } from "@/lib/media/access";
import { addDays } from "./week";
import { dedupeKey, ITEM_COLUMNS, nextSlotSentence, toItem, type CalendarItem, type UpcomingCandidate } from "./coming-up";

export { ITEM_COLUMNS, toItem };

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

/**
 * Reading and writing the Coming up list. Every query filters on
 * company_id: the service-role client bypasses RLS.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VenueRow {
  id: string;
  name: string;
  timezone: string | null;
  post_pack: string | null;
}

/** The company, only if it is a venue. A business-to-business company is told plainly. */
export async function requireVenue(supabase: SupabaseAdmin, companyId: string): Promise<VenueRow | NextResponse> {
  const { data } = await supabase.from("companies").select("id, name, timezone, post_pack").eq("id", companyId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if ((data as VenueRow).post_pack !== "hospitality") return NextResponse.json({ error: "This is for venues" }, { status: 400 });
  return data as VenueRow;
}

/**
 * An item, only if the caller belongs to its company. Another company's item
 * answers 404, the same as one that does not exist, so ids cannot be probed.
 */
export async function authoriseItem(
  id: string
): Promise<{ ok: true; profile: AccessProfile & Record<string, unknown>; item: CalendarItem } | Refusal> {
  const profile = await getSignedInProfile();
  if (!profile) return { ok: false, status: 401, error: "Unauthorized" };
  if (!UUID_RE.test(id)) return { ok: false, status: 400, error: "Invalid id" };
  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase.from("venue_calendar_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row || !canAccessCompany(profile, row.company_id as string)) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, profile, item: toItem(row) };
}

/** The list for the page: still to come, plus the last seven days. */
export async function listItems(supabase: SupabaseAdmin, companyId: string, today: string): Promise<CalendarItem[]> {
  const since = addDays(today, -7);
  const { data } = await supabase
    .from("venue_calendar_items")
    .select(ITEM_COLUMNS)
    .eq("company_id", companyId)
    .or(`starts_on.gte.${since},ends_on.gte.${since}`)
    .order("starts_on", { ascending: true })
    .limit(500);
  return ((data || []) as Record<string, unknown>[]).map(toItem);
}

export interface SaveResult {
  added: CalendarItem[];
  /** Titles already on the list, so not added again. */
  already: string[];
}

/**
 * Save checked candidates, skipping any already on the list (same company,
 * kind, title in plain letters and start date). Cancelled items count too:
 * something the venue cancelled is not brought back by the next dictation.
 */
export async function saveCandidates(
  supabase: SupabaseAdmin,
  companyId: string,
  candidates: UpcomingCandidate[],
  source: "dictation" | "upload" | "manual",
  createdBy: string | null
): Promise<SaveResult> {
  if (candidates.length === 0) return { added: [], already: [] };
  const starts = [...new Set(candidates.map((c) => c.startsOn))];
  const { data: existing } = await supabase
    .from("venue_calendar_items")
    .select("kind, title, starts_on")
    .eq("company_id", companyId)
    .in("starts_on", starts);
  const have = new Set(
    ((existing || []) as { kind: CalendarItem["kind"]; title: string; starts_on: string }[]).map((r) => dedupeKey(companyId, r.kind, r.title, String(r.starts_on).slice(0, 10)))
  );
  const already: string[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const key = dedupeKey(companyId, c.kind, c.title, c.startsOn);
    if (have.has(key)) {
      already.push(c.title);
      continue;
    }
    have.add(key);
    rows.push({
      company_id: companyId,
      kind: c.kind,
      title: c.title,
      details: c.details,
      starts_on: c.startsOn,
      ends_on: c.endsOn,
      start_time: c.time,
      source,
      created_by: createdBy,
    });
  }
  if (rows.length === 0) return { added: [], already };
  const { data, error } = await supabase.from("venue_calendar_items").insert(rows).select(ITEM_COLUMNS);
  if (error) throw new Error(`Could not save to Coming up: ${error.message}`);
  return { added: ((data || []) as Record<string, unknown>[]).map(toItem), already };
}

/** The item as the page shows it: with a sentence about its next post. */
export function forPage(item: CalendarItem, today: string): CalendarItem & { next: string } {
  return { ...item, next: nextSlotSentence(item, today) };
}
