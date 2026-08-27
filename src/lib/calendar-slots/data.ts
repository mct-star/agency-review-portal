import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarSlot, WeekPhotoTier } from "@/types/database";

export interface CalendarSlotCompany {
  id: string;
  name: string;
  slug: string;
}

export interface WeekTierInfo {
  id: string;
  title: string | null;
  photo_tier: WeekPhotoTier | null;
  tier_set_at: string | null;
  arc_movement: string | null;
  seasonality_note: string | null;
}

export interface CalendarSlotRow extends CalendarSlot {
  company: CalendarSlotCompany | null;
}

export interface WeekGroup {
  companyId: string;
  companyName: string;
  weekNumber: number;
  year: number;
  weekStartDate: string;
  weekEndDate: string;
  sourceWeekLabel: string | null;
  /** Opportunistic join by (company_id, week_number, year). Null
   * when no weeks row exists yet for this ISO week: never required. */
  week: WeekTierInfo | null;
  slots: CalendarSlotRow[];
}

interface WeekTierRow {
  id: string;
  company_id: string;
  week_number: number;
  year: number;
  title: string | null;
  photo_tier: WeekPhotoTier | null;
  tier_set_at: string | null;
  arc_movement: string | null;
  seasonality_note: string | null;
}

function weekKey(companyId: string, weekNumber: number, year: number): string {
  return `${companyId}|${weekNumber}|${year}`;
}

/**
 * Fetch every calendar slot, joined to its company. Ordered by slot
 * date so grouping and display both read chronologically without a
 * second sort pass.
 */
export async function getCalendarSlots(
  supabase: SupabaseClient
): Promise<CalendarSlotRow[]> {
  const { data, error } = await supabase
    .from("calendar_slots")
    .select("*, company:companies(id, name, slug)")
    .order("slot_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as CalendarSlotRow[];
}

/**
 * Opportunistic week enrichment. calendar_slots.week_id is null for
 * every row seeded ahead of its weeks row (see migration 032), so
 * this joins by (company_id, week_number, year) instead of the FK.
 * A week absent from the returned map simply has no tier set yet,
 * callers must never require an entry here.
 */
export async function getWeekTierMap(
  supabase: SupabaseClient,
  companyIds: string[]
): Promise<Map<string, WeekTierInfo>> {
  const map = new Map<string, WeekTierInfo>();
  if (companyIds.length === 0) return map;

  const { data, error } = await supabase
    .from("weeks")
    .select(
      "id, company_id, week_number, year, title, photo_tier, tier_set_at, arc_movement, seasonality_note"
    )
    .in("company_id", companyIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const w of (data || []) as WeekTierRow[]) {
    map.set(weekKey(w.company_id, w.week_number, w.year), {
      id: w.id,
      title: w.title,
      photo_tier: w.photo_tier,
      tier_set_at: w.tier_set_at,
      arc_movement: w.arc_movement,
      seasonality_note: w.seasonality_note,
    });
  }
  return map;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Group slots into one row per (company, ISO week, year), sorted
 * chronologically. The weeks join is looked up per group and left
 * null when no weeks row exists yet, the group still renders from
 * calendar_slots' own week_number / year / week_start_date.
 */
export function groupSlotsByWeek(
  slots: CalendarSlotRow[],
  weekTierMap: Map<string, WeekTierInfo>
): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();

  for (const slot of slots) {
    const key = weekKey(slot.company_id, slot.week_number, slot.year);
    let group = groups.get(key);
    if (!group) {
      group = {
        companyId: slot.company_id,
        companyName: slot.company?.name || "Unknown company",
        weekNumber: slot.week_number,
        year: slot.year,
        weekStartDate: slot.week_start_date,
        weekEndDate: addDaysToDateString(slot.week_start_date, 6),
        sourceWeekLabel: slot.source_week_label,
        week: weekTierMap.get(key) || null,
        slots: [],
      };
      groups.set(key, group);
    }
    group.slots.push(slot);
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.weekStartDate.localeCompare(b.weekStartDate)
  );
}

/**
 * Convenience wrapper for both pages: fetch every slot, join the
 * weeks it can, and return grouped, chronological weeks.
 */
export async function getCalendarBoardData(
  supabase: SupabaseClient
): Promise<WeekGroup[]> {
  const slots = await getCalendarSlots(supabase);
  const companyIds = Array.from(new Set(slots.map((s) => s.company_id)));
  const weekTierMap = await getWeekTierMap(supabase, companyIds);
  return groupSlotsByWeek(slots, weekTierMap);
}

// ---- ISO week math -----------------------------------------------
// Ported from scripts/seed-calendar-slots.mjs so "this week" always
// agrees with the week_number stored on the rows it is compared
// against. Do not diverge from that algorithm without checking the
// seed script too.

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function addDaysUtc(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

export function isoWeekOf(date: Date): { week: number; year: number } {
  const t = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = utcDate(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

/** This ISO week and the one immediately following it, evaluated now. */
export function currentAndNextIsoWeek(now: Date = new Date()): {
  current: { week: number; year: number };
  next: { week: number; year: number };
} {
  return {
    current: isoWeekOf(now),
    next: isoWeekOf(addDaysUtc(now, 7)),
  };
}

/**
 * Pull out the week groups matching the given ISO week/year targets,
 * keeping the input list's chronological order.
 */
export function pickWeekGroups(
  groups: WeekGroup[],
  targets: { week: number; year: number }[]
): WeekGroup[] {
  return groups.filter((g) =>
    targets.some((t) => t.week === g.weekNumber && t.year === g.year)
  );
}

/**
 * Earliest group at or after the given date, for the "nothing
 * planned this week yet" fallback on the planning page. Assumes
 * groups is already sorted ascending by weekStartDate.
 */
export function earliestGroupFrom(
  groups: WeekGroup[],
  fromDateStr: string
): WeekGroup | null {
  return groups.find((g) => g.weekStartDate >= fromDateStr) || null;
}
