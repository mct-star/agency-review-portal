/**
 * Pure helpers for the venue's "This week" page and its day list: which
 * dates a week covers, posts grouped by day, and plain-words labels.
 * Dates are YYYY-MM-DD strings throughout (see ./week.ts).
 */
import { addDays, longDateLabel, mondayOf, weekDates } from "./week";

export interface DayPost {
  id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
}

export interface DayGroup<P extends DayPost> {
  date: string;
  label: string;
  isToday: boolean;
  posts: P[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string that is a real date, or null. */
export function cleanDate(s: unknown): string | null {
  if (typeof s !== "string" || !ISO.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** The Monday to Sunday week holding a date, with the Mondays either side. */
export function weekWindow(anchor: string): { start: string; end: string; dates: string[]; previous: string; next: string } {
  const start = mondayOf(anchor);
  return { start, end: addDays(start, 6), dates: weekDates(start), previous: addDays(start, -7), next: addDays(start, 7) };
}

/** `count` consecutive dates starting at `from`. */
export function nextDays(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/** Posts sorted into the given days, earliest time first. Posts outside the days are left out. */
export function groupByDay<P extends DayPost>(posts: P[], dates: string[], today: string): DayGroup<P>[] {
  const byDate = new Map<string, P[]>(dates.map((d) => [d, []]));
  for (const p of posts) {
    if (p.scheduled_date && byDate.has(p.scheduled_date)) byDate.get(p.scheduled_date)!.push(p);
  }
  return dates.map((date) => ({
    date,
    label: date === today ? `Today, ${longDateLabel(date)}` : longDateLabel(date),
    isToday: date === today,
    posts: byDate.get(date)!.sort((a, b) => (a.scheduled_time || "99").localeCompare(b.scheduled_time || "99")),
  }));
}

/** "Monday 13 October to Sunday 19 October". */
export function weekRangeLabel(start: string): string {
  return `${longDateLabel(start)} to ${longDateLabel(addDays(start, 6))}`;
}

/** The first line of a caption with markdown marks removed, cut to fit a list row. */
export function captionFirstLine(body: string | null | undefined, max = 90): string {
  const line = (body || "").split("\n").map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim()).find(Boolean) || "";
  return line.length > max ? `${line.slice(0, max - 3).trimEnd()}...` : line;
}

/** "14:30" from a Postgres time, or null. */
export function timeLabel(time: string | null | undefined): string | null {
  return time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : null;
}

/** A Move that failed, in words a venue owner understands. */
export function moveErrorText(status: number, error: string | undefined): string {
  if (status === 422 || /no content week/i.test(error || "")) {
    return "That day is not open for posts yet. Pick a day in a week that already has posts, or ask us to open it.";
  }
  if (status === 403 || status === 404) return "We could not find that post. Refresh the page and try again.";
  return "That did not save. Try again in a moment.";
}
