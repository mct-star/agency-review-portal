import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a post sits on the plan (27 Sept 2026).
 *
 * A post is placed by date: dropping it on a day of any week sets its
 * week, its day and its scheduled date together. Before this the calendar
 * moved only the weekday, so a post dragged into another week snapped back
 * into its own. Days are stored lowercase ("sunday"), which is what the Mac
 * and the weekly run write; the calendar used to read only "Sunday" and so
 * showed none of them.
 *
 * Posts not yet placed live in the company's standalone week (week_number
 * 0) with no day: the Unscheduled tray.
 */

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function normDay(day: string | null | undefined): Weekday | null {
  const d = (day || "").trim().toLowerCase();
  return (WEEKDAYS as readonly string[]).includes(d) ? (d as Weekday) : null;
}

export const isIsoDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** The weekday of a YYYY-MM-DD date. */
export function dayOfDate(date: string): Weekday {
  const js = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[js === 0 ? 6 : js - 1];
}

/** The date a weekday falls on in the week starting (Monday) on or before date_start. */
export function dateInWeek(weekStart: string, day: string | null | undefined): string | null {
  const d = normDay(day);
  if (!d || !isIsoDate(weekStart)) return null;
  const start = new Date(`${weekStart}T00:00:00Z`);
  const js = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (js === 0 ? -6 : 1 - js) + WEEKDAYS.indexOf(d));
  return start.toISOString().slice(0, 10);
}

export interface PlanWeek { id: string; week_number: number; date_start: string; date_end: string }

/** The planned (numbered) week whose dates cover `date`. */
export function weekForDate<W extends PlanWeek>(weeks: W[], date: string): W | null {
  return weeks.find(w => w.week_number > 0 && w.date_start <= date && date <= w.date_end) ?? null;
}

/** Find or create the company's standalone week, home of the Unscheduled tray. */
export async function standaloneWeekId(supabase: SupabaseClient, companyId: string): Promise<string> {
  const { data: found, error: findErr } = await supabase.from("weeks").select("id")
    .eq("company_id", companyId).eq("week_number", 0).order("created_at").limit(1).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (found?.id) return found.id as string;
  const today = new Date().toISOString().slice(0, 10);
  const { data: week, error } = await supabase.from("weeks").insert({
    company_id: companyId, week_number: 0, year: new Date().getFullYear(),
    date_start: today, date_end: today, title: "Standalone content", status: "draft",
  }).select("id").single();
  if (error || !week) throw new Error(`Could not create the standalone week: ${error?.message}`);
  return week.id as string;
}
