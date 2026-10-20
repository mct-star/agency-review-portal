/** The editorial slot carried from Calendar into a new review draft, never a publishing instruction. */
export type DraftPlan = { date: string | null; time: string | null; error: string | null };

export function readDraftPlan(date: unknown, time: unknown): DraftPlan {
  if ((date === undefined || date === null || date === "") && (time === undefined || time === null || time === "")) {
    return { date: null, time: null, error: null };
  }
  const validDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  const validTime = time === undefined || time === null || time === ""
    || (typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time));
  if (!validDate || !validTime) return { date: null, time: null, error: "The planned date or time is invalid. Return to Calendar and choose a slot again." };
  return { date, time: typeof time === "string" && time ? time.slice(0, 5) : null, error: null };
}

export function calendarQuickCreateHref(companyId: string, date: string, time: string, postType: string) {
  return `/generate/quick?${new URLSearchParams({ company: companyId, date, time, postType })}`;
}

export function plannedDraftLabel(plan: DraftPlan) {
  if (!plan.date) return null;
  const date = new Date(`${plan.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `Planned draft for ${date}${plan.time ? ` at ${plan.time}` : ""}. It will stay pending until you review it. Publishing is a separate step.`;
}
