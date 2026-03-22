/**
 * Format a week label as "w/c DD Month" (UK date format) from the week's start date.
 * Falls back to "Week N" if no date_start is available.
 *
 * @param dateStart - ISO date string (e.g. "2026-03-30") or null/undefined
 * @param weekNumber - numeric week number (fallback)
 * @param suffix - optional suffix to append (e.g. " Review", " Approved")
 */
export function formatWeekLabel(
  dateStart: string | null | undefined,
  weekNumber: number,
  suffix?: string,
): string {
  const s = suffix || "";
  if (dateStart) {
    const d = new Date(dateStart + "T00:00:00");
    const formatted = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
    });
    return `w/c ${formatted}${s}`;
  }
  return `Week ${weekNumber}${s}`;
}

/**
 * Short version for tight UI spots — returns "w/c 30 Mar" or "W14".
 */
export function formatWeekLabelShort(
  dateStart: string | null | undefined,
  weekNumber: number,
): string {
  if (dateStart) {
    const d = new Date(dateStart + "T00:00:00");
    const formatted = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    return `w/c ${formatted}`;
  }
  return `W${weekNumber}`;
}
