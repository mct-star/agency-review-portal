import { addDays, dayNameOf, longDateLabel, parseDate } from "./week";

/**
 * Coming up: a venue's list of dated events and launches, and the posts each
 * one earns. Everything here is pure, so the daily job, the routes and the
 * page all agree on what is due and when.
 *
 * An event (a quiz night, live music) gets up to three build-up posts: seven
 * days before (save the date), two days before (this weekend, on Thursday)
 * and on the day (tonight). Each can be switched off per item.
 * A launch (a new dish, a new menu, an offer) gets a reveal on its start date
 * and, when it runs for four days or more, one still-on post at the midpoint.
 */

export type ComingUpKind = "event" | "launch";
export type SlotKind = "week" | "two_days" | "day_of" | "reveal" | "still_on";

export interface BuildUp {
  week: boolean;
  two_days: boolean;
  day_of: boolean;
}

export const DEFAULT_BUILD_UP: BuildUp = { week: true, two_days: true, day_of: true };

export interface CalendarItem {
  id: string;
  company_id: string;
  kind: ComingUpKind;
  title: string;
  details: string | null;
  starts_on: string;
  ends_on: string | null;
  start_time: string | null;
  build_up: BuildUp;
  status: "active" | "cancelled";
  source?: "dictation" | "upload" | "manual";
}

/** Something found (in a dictation, an upload or the form) that is not saved yet. */
export interface UpcomingCandidate {
  kind: ComingUpKind;
  title: string;
  details: string | null;
  startsOn: string;
  endsOn: string | null;
  time: string | null;
}

export const ITEM_COLUMNS = "id, company_id, kind, title, details, starts_on, ends_on, start_time, build_up, status, source";

export function toItem(row: Record<string, unknown>): CalendarItem {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    kind: row.kind === "launch" ? "launch" : "event",
    title: String(row.title ?? ""),
    details: (row.details as string | null) ?? null,
    starts_on: String(row.starts_on).slice(0, 10),
    ends_on: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    start_time: (row.start_time as string | null) ?? null,
    build_up: readBuildUp(row.build_up),
    status: row.status === "cancelled" ? "cancelled" : "active",
    source: row.source as CalendarItem["source"],
  };
}

export interface DatedSlot {
  slot: SlotKind;
  date: string;
}

export const WINDOW_DAYS = 120;
export const STILL_ON_MIN_DAYS = 4;

/** The build-up switches as stored, with anything missing treated as on. */
export function readBuildUp(raw: unknown): BuildUp {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { week: r.week !== false, two_days: r.two_days !== false, day_of: r.day_of !== false };
}

/** Whole days from a to b (b minus a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** Every post an item earns, with its date, in date order. A cancelled item earns none. */
export function slotsFor(item: Pick<CalendarItem, "kind" | "starts_on" | "ends_on" | "build_up" | "status">): DatedSlot[] {
  if (item.status !== "active") return [];
  if (item.kind === "event") {
    const b = readBuildUp(item.build_up);
    const out: DatedSlot[] = [];
    if (b.week) out.push({ slot: "week", date: addDays(item.starts_on, -7) });
    if (b.two_days) out.push({ slot: "two_days", date: addDays(item.starts_on, -2) });
    if (b.day_of) out.push({ slot: "day_of", date: item.starts_on });
    return out;
  }
  const out: DatedSlot[] = [{ slot: "reveal", date: item.starts_on }];
  if (item.ends_on) {
    const runDays = daysBetween(item.starts_on, item.ends_on) + 1;
    if (runDays >= STILL_ON_MIN_DAYS) out.push({ slot: "still_on", date: addDays(item.starts_on, Math.floor((runDays - 1) / 2)) });
  }
  return out;
}

export interface DueSlot {
  item: CalendarItem;
  slot: SlotKind;
}

/**
 * How close the thing itself is, for the tie-break: the nearer event wins.
 * On-the-day and reveal are 0; a still-on post is a reminder, so it comes last.
 */
function nearness(d: DueSlot, date: string): number {
  if (d.slot === "still_on") return 10_000;
  return Math.max(0, daysBetween(date, d.item.starts_on));
}

/**
 * The items with a post due on a date, best first: the nearer event wins, an
 * event beats a launch on the same footing, then the earlier time, then the title.
 */
export function dueSlots(items: CalendarItem[], date: string): DueSlot[] {
  const due: DueSlot[] = [];
  for (const item of items) {
    for (const s of slotsFor(item)) if (s.date === date) due.push({ item, slot: s.slot });
  }
  return due.sort(
    (a, b) =>
      nearness(a, date) - nearness(b, date) ||
      (a.item.kind === b.item.kind ? 0 : a.item.kind === "event" ? -1 : 1) ||
      (a.item.start_time || "99:99").localeCompare(b.item.start_time || "99:99") ||
      a.item.title.localeCompare(b.item.title)
  );
}

/** The next post an item will earn on or after a date, or null. */
export function nextSlot(item: CalendarItem, fromDate: string): DatedSlot | null {
  return slotsFor(item).find((s) => s.date >= fromDate) ?? null;
}

export const SLOT_LABEL: Record<SlotKind, string> = {
  week: "Save-the-date post",
  two_days: "Two-days-to-go post",
  day_of: "On-the-day post",
  reveal: "Reveal post",
  still_on: "Still-on post",
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 18 Oct". */
export function shortDateLabel(ymd: string): string {
  const d = parseDate(ymd);
  return `${dayNameOf(ymd).slice(0, 3)} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

/** "Save-the-date post drafts on Sat 18 Oct", or why nothing is coming. */
export function nextSlotSentence(item: CalendarItem, today: string): string {
  if (item.status === "cancelled") return "Cancelled. No posts will be drafted.";
  const next = nextSlot(item, today);
  if (!next) return item.kind === "event" && daysBetween(today, item.starts_on) >= 0 ? "No posts switched on." : "No more posts to draft.";
  return `${SLOT_LABEL[next.slot]} drafts ${next.date === today ? "today" : `on ${shortDateLabel(next.date)}`}`;
}

/** The two-days-before phrase: "this weekend" for a Saturday or Sunday, otherwise "on Thursday". */
export function twoDayPhrase(startsOn: string): string {
  const day = dayNameOf(startsOn);
  return day === "Saturday" || day === "Sunday" ? "this weekend" : `on ${day}`;
}

/** What the slot means, in words the writer is given as context. */
export function slotContext(item: CalendarItem, slot: SlotKind): string {
  const when = `${longDateLabel(item.starts_on)}${item.start_time ? ` at ${item.start_time}` : ""}`;
  switch (slot) {
    case "week":
      return `Seven days to go. A save-the-date post: it is on ${when}. Give people a reason to put it in the diary.`;
    case "two_days":
      return `Two days to go. Say it is ${twoDayPhrase(item.starts_on)} (${when}). A nudge to book or plan for it.`;
    case "day_of":
      return `It is today${item.start_time ? `, at ${item.start_time}` : ""}. Say "tonight" if the time supplied is in the evening, otherwise "today".`;
    case "reveal":
      return `The reveal: it starts today${item.ends_on ? ` and runs until ${longDateLabel(item.ends_on)}` : ""}.`;
    case "still_on":
      return `Still on: a reminder that it is still running${item.ends_on ? `, until ${longDateLabel(item.ends_on)}` : ""}.`;
  }
}

/** The brief the writer gets for an item's post: the owner's words, then the slot. */
export function buildSlotBrief(item: CalendarItem, slot: SlotKind, forecastLine = false): string {
  return [
    `${item.title}.`,
    item.details?.trim() || "",
    item.kind === "event" ? `Date: ${longDateLabel(item.starts_on)}${item.start_time ? `, ${item.start_time}` : ""}.` : `Starts ${longDateLabel(item.starts_on)}${item.ends_on ? `, until ${longDateLabel(item.ends_on)}` : ""}.`,
    `WHEN THIS POST GOES OUT: ${slotContext(item, slot)}`,
    forecastLine ? "Optional: one short line on today's weather, using only the forecast figures, if it fits the post (for example that the event is indoors). Leave it out if it does not fit." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const DISH_WORDS = /\b(dish|menu|special|plate|starter|main|dessert|pudding|pie|burger|steak|fish|roast|curry|pizza|pasta|salad|soup|cocktail|wine|beer|ale|gin|brunch|lunch|dinner|breakfast|tasting|cake|sandwich|chips|served|course)\b/i;

/** The post type an item's post is written as: a launch that names a dish is a special. */
export function postTypeForItem(item: Pick<CalendarItem, "kind" | "title" | "details">): "event" | "special_of_the_day" {
  if (item.kind === "launch" && DISH_WORDS.test(`${item.title} ${item.details ?? ""}`)) return "special_of_the_day";
  return "event";
}

/** The notification line: "Saturday's quiz night post is ready to approve". */
export function readyHeadline(item: CalendarItem): string {
  if (item.kind === "event") return `${dayNameOf(item.starts_on)}'s ${item.title} post is ready to approve`;
  return `The ${item.title} post is ready to approve`;
}

/** The same thing said twice is saved once: company, kind, title in plain letters, start date. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|our|a) /, "")
    .trim();
}

export function dedupeKey(companyId: string, kind: ComingUpKind, title: string, startsOn: string): string {
  return `${companyId}|${kind}|${normaliseTitle(title)}|${startsOn}`;
}

// ── Validation ────────────────────────────────────────────────

/** A real calendar date in YYYY-MM-DD form (2026-02-30 is not). */
export function isRealDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = parseDate(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "19:00", "7pm", "7.30pm" to HH:MM; null when it is not a clear time. */
export function normaliseTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  let m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
  }
  m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

export type CandidateCheck = { ok: true; item: UpcomingCandidate } | { ok: false; reason: string };

/**
 * One candidate, checked: a kind, a title, a real start date that is not over
 * and is within 120 days, an end date not before the start. Nothing is
 * repaired by guessing: a bad date is a refusal with the reason in plain words.
 */
export function checkCandidate(raw: unknown, today: string): CandidateCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const name = title || "Something";
  if (!title) return { ok: false, reason: "An item with no name was left out." };
  const kind = r.kind;
  if (kind !== "event" && kind !== "launch") return { ok: false, reason: `${name} was left out: it is not clear if it is an event or a launch.` };
  if (!isRealDate(r.startsOn)) return { ok: false, reason: `${name} was left out because it has no clear date.` };
  const startsOn = r.startsOn;
  let endsOn: string | null = null;
  if (r.endsOn !== undefined && r.endsOn !== null && r.endsOn !== "") {
    if (!isRealDate(r.endsOn)) return { ok: false, reason: `${name} was left out: its end date is not a real date.` };
    endsOn = r.endsOn;
    if (endsOn < startsOn) return { ok: false, reason: `${name} was left out: it ends before it starts.` };
    if (endsOn === startsOn) endsOn = null;
  }
  if ((endsOn ?? startsOn) < today) return { ok: false, reason: `${name} was left out: it has already happened.` };
  if (daysBetween(today, startsOn) > WINDOW_DAYS) return { ok: false, reason: `${name} was left out: it is more than ${WINDOW_DAYS} days away. Add it nearer the time.` };
  if (endsOn && daysBetween(startsOn, endsOn) > 366) return { ok: false, reason: `${name} was left out: it runs for more than a year.` };
  const details = typeof r.details === "string" && r.details.trim() ? r.details.trim().slice(0, 1000) : null;
  const rawTime = r.time ?? r.startTime;
  const time = rawTime === undefined || rawTime === null || rawTime === "" ? null : normaliseTime(rawTime);
  return { ok: true, item: { kind, title, details, startsOn, endsOn, time } };
}

export interface ParsedUpcoming {
  items: UpcomingCandidate[];
  /** Plain-words notes: items left out and why, and things mentioned with no date. */
  notes: string[];
}

/** Check a list of candidates, dropping repeats within the list. */
export function validateUpcoming(rawList: unknown, today: string, undated: unknown = []): ParsedUpcoming {
  const items: UpcomingCandidate[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const c = checkCandidate(raw, today);
    if (!c.ok) {
      notes.push(c.reason);
      continue;
    }
    const key = dedupeKey("", c.item.kind, c.item.title, c.item.startsOn);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(c.item);
  }
  for (const u of Array.isArray(undated) ? undated : []) {
    if (typeof u === "string" && u.trim()) notes.push(`${u.trim().slice(0, 120)} was not added to Coming up because no date was given.`);
  }
  items.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return { items, notes };
}

/** Pull the JSON object out of a model reply: fences stripped, outer braces taken if wrapped. */
export function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const attempt = (s: string) => {
    const v = JSON.parse(s);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v as Record<string, unknown>;
  };
  try {
    return attempt(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("The reply was not valid JSON");
    try {
      return attempt(cleaned.slice(first, last + 1));
    } catch {
      throw new Error("The reply was not valid JSON");
    }
  }
}

/** The model's `{ upcoming: [...], undated: [...] }` reply, checked. */
export function parseUpcomingJson(text: string, today: string): ParsedUpcoming {
  const obj = extractJsonObject(text);
  if (!Array.isArray(obj.upcoming)) throw new Error("The reply had no upcoming list");
  return validateUpcoming(obj.upcoming, today, obj.undated);
}

/** The rules every reader of dates follows: the dictation planner and the upload reader. */
export function upcomingRules(today: string): string {
  return [
    "COMING UP (dated events and launches)",
    `- Today is ${longDateLabel(today)} ${today}. List every dated event or launch mentioned, from today up to ${WINDOW_DAYS} days ahead, including ones beyond this week.`,
    "- kind: event (a dated happening: a quiz night, live music, a wine tasting, Christmas bookings opening) or launch (a new dish, a new menu, an offer, which starts on a date and may run until an end date).",
    "- title: a short name in the speaker's or the document's own words. details: the facts given about it (price, how to book, what is in it), copied, nothing added.",
    "- startsOn and endsOn are YYYY-MM-DD. Work a date out from a weekday or 'next Friday' only when it is unambiguous from today's date. endsOn only if an end was given.",
    "- time: HH:MM in 24 hours, only if a time was given. Otherwise leave it out.",
    "- Never invent a date. Anything mentioned without a clear date goes in undated as its name, and not in upcoming.",
  ].join("\n");
}

/** The prompt for reading an upload (a PDF's text, or a photo of a board or a flyer). */
export function buildExtractPrompt(args: { venueName: string; today: string; source: "pdf" | "image" }): { system: string; user: string } {
  const system = [
    `You read what a venue, ${args.venueName}, has coming up, from ${args.source === "pdf" ? "the text of a document" : "a photo of a chalkboard, a flyer or a poster"}.`,
    "SOURCE BOUNDARY (non-negotiable)",
    "- Use only what is written there. Never invent an event, a date, a time, a price or a name.",
    upcomingRules(args.today),
    "OUTPUT",
    'Return JSON only: {"upcoming": [{"kind": "event" | "launch", "title": string, "details": string, "startsOn": "YYYY-MM-DD", "endsOn": "YYYY-MM-DD" (optional), "time": "HH:MM" (optional)}], "undated": [string]}',
  ].join("\n");
  const user = args.source === "pdf" ? "THE DOCUMENT'S TEXT FOLLOWS." : "Read the photo and list what is coming up.";
  return { system, user };
}

// ── .ics calendar files ───────────────────────────────────────

function unescapeIcs(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** A UTC instant's local date and time in a time zone. */
function localParts(utc: Date, timeZone: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(utc).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

interface IcsDate {
  date: string;
  time: string | null;
  allDay: boolean;
}

function readIcsDate(params: string, value: string, timeZone: string): IcsDate | null {
  const v = value.trim();
  const allDay = /VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (allDay || !m[4]) return isRealDate(date) ? { date, time: null, allDay: true } : null;
  if (m[7] === "Z") {
    const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
    const local = localParts(utc, timeZone);
    return { date: local.date, time: local.time, allDay: false };
  }
  // A TZID or floating time is taken as written: it is the venue's own clock.
  return isRealDate(date) ? { date, time: `${m[4]}:${m[5]}`, allDay: false } : null;
}

/**
 * Events from an .ics file: SUMMARY, DESCRIPTION, DTSTART and DTEND, all-day
 * and timed. Every one is an event (a calendar does not say "launch"); the
 * person can change that on the review list. An all-day DTEND is the day
 * after the last day, so one day is taken off.
 */
export function parseIcs(text: string, timeZone = "Europe/London"): Array<Record<string, unknown>> {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: Array<Record<string, unknown>> = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) {
      cur = {};
      continue;
    }
    if (/^END:VEVENT/i.test(line)) {
      if (cur) {
        const summary = cur.SUMMARY ? unescapeIcs(cur.SUMMARY.value) : "";
        const start = cur.DTSTART ? readIcsDate(cur.DTSTART.params, cur.DTSTART.value, timeZone) : null;
        const end = cur.DTEND ? readIcsDate(cur.DTEND.params, cur.DTEND.value, timeZone) : null;
        let endsOn: string | null = null;
        if (start && end) {
          const last = end.allDay ? addDays(end.date, -1) : end.date;
          endsOn = last > start.date ? last : null;
        }
        out.push({
          kind: "event",
          title: summary,
          details: cur.DESCRIPTION ? unescapeIcs(cur.DESCRIPTION.value) : null,
          startsOn: start?.date ?? null,
          endsOn,
          time: start?.time ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const [name, ...params] = head.split(";");
    const key = name.toUpperCase();
    if (["SUMMARY", "DESCRIPTION", "DTSTART", "DTEND"].includes(key) && !cur[key]) {
      cur[key] = { params: params.join(";"), value: line.slice(colon + 1) };
    }
  }
  return out;
}
