/**
 * Week arithmetic for hospitality posts. Weeks run Monday to Sunday and are
 * numbered by ISO week, to match weeks.week_number elsewhere in the app.
 * Everything is UTC date arithmetic on YYYY-MM-DD strings, so a server in
 * any time zone gives the same answer.
 */

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function parseDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const d = parseDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

export function mondayOf(ymd: string): string {
  const d = parseDate(ymd);
  const dow = d.getUTCDay() || 7; // Sunday counts as day 7
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return formatDate(d);
}

export function isoWeekOfDate(ymd: string): { week: number; year: number } {
  const t = parseDate(ymd);
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

export function dayNameOf(ymd: string): string {
  return DAY_NAMES[parseDate(ymd).getUTCDay()];
}

/** Today's date in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Tuesday 14 October" for a date. */
export function longDateLabel(ymd: string): string {
  const d = parseDate(ymd);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${dayNameOf(ymd)} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/** The seven dates of the week containing the given date, Monday first. */
export function weekDates(ymd: string): string[] {
  const mon = mondayOf(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** HH:MM from a Postgres time ("07:00:00") or an HH:MM string. */
export function hhmm(time: string): string {
  return /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "07:00";
}
