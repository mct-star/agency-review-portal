/**
 * The calendar date a piece posts on, for exports.
 *
 * The piece's own scheduled_date wins. Older pieces carry only a day: as a
 * name ("Monday", "monday") or, from Week Batch, as a JavaScript day number
 * in a string ("0" is Sunday). Current weeks start on a Monday and run to
 * Sunday; older weeks started on a Sunday and ran to Saturday. The day is
 * counted from whichever the week's start date is.
 */
const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

export function postDateFor(
  piece: { scheduled_date?: string | null; day_of_week?: string | number | null },
  weekStart: string,
): string {
  if (piece.scheduled_date && /^\d{4}-\d{2}-\d{2}/.test(piece.scheduled_date)) return piece.scheduled_date.slice(0, 10);

  const raw = piece.day_of_week;
  let jsDay: number | null = null;
  if (typeof raw === "number") jsDay = raw;
  else if (typeof raw === "string" && /^[0-6]$/.test(raw.trim())) jsDay = Number(raw.trim());
  else if (typeof raw === "string") jsDay = DAY_INDEX[raw.trim().toLowerCase()] ?? null;

  const start = new Date(`${weekStart.slice(0, 10)}T00:00:00Z`);
  if (jsDay === null) return start.toISOString().slice(0, 10);
  const sundayStart = start.getUTCDay() === 0;
  const offset = sundayStart ? jsDay : (jsDay + 6) % 7 - ((start.getUTCDay() + 6) % 7);
  const out = new Date(start);
  out.setUTCDate(start.getUTCDate() + offset);
  return out.toISOString().slice(0, 10);
}
