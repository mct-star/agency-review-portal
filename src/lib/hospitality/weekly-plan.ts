import { dayNameOf } from "./week";
import type { VenueSettings } from "./prompts";
import { upcomingRules, validateUpcoming, type UpcomingCandidate } from "./coming-up";

/**
 * The weekly chat: one dictation about the week becomes five to seven posts,
 * each with a day, a type and a brief, and a suggested library photo.
 *
 * Stage one (here) turns the transcript into a plan. It may only use what
 * the speaker said, so it can return fewer than five posts when the
 * dictation does not support five, and it says so rather than padding. An
 * event or a special can appear twice (an announcement early in the week
 * and a reminder on the day), which repeats a fact without inventing one.
 * Stage two writes each post with the same writer and the same figure check
 * as every other hospitality post.
 *
 * The same reply also lists every dated event or launch the speaker
 * mentioned, up to 120 days ahead, for the Coming up list. A thing with no
 * clear date is named back to the person, never given a guessed one.
 */

/** The weather post is made by the daily job, so the chat plans the other four. */
export const PLANNABLE_TYPES = ["special_of_the_day", "whats_on_this_week", "live_scene", "event"] as const;
export type PlannableType = (typeof PLANNABLE_TYPES)[number];

export interface PlanItem {
  date: string; // YYYY-MM-DD, inside the target week
  postType: PlannableType;
  /** What the speaker said about it, in their words: the facts the post may use. */
  brief: string;
  /** Where in the library to look, if the speaker said. */
  place?: string[];
  subject?: string[];
}

export const MIN_POSTS = 5;
export const MAX_POSTS = 7;

/** When each kind of post goes out unless the speaker says otherwise. */
export const DEFAULT_TIMES: Record<PlannableType, string> = {
  whats_on_this_week: "09:00",
  special_of_the_day: "11:30",
  event: "12:00",
  live_scene: "17:00",
};

export function buildPlanPrompt(args: {
  venueName: string;
  settings: VenueSettings;
  weekDates: string[];
  transcript: string;
  /** The venue's today, for working out dates on the Coming up list. Defaults to the week's Monday. */
  today?: string;
}): { system: string; user: string } {
  const days = args.weekDates.map((d) => `${dayNameOf(d)} ${d}`).join(", ");
  const system = [
    `You turn a venue owner's spoken notes about the coming week into a plan of social posts for ${args.venueName}.`,
    "SOURCE BOUNDARY (non-negotiable)",
    "- Use only what the speaker actually said. Never invent a special, an event, a price, a time, a date or a name.",
    `- Plan between ${MIN_POSTS} and ${MAX_POSTS} posts if the notes support that many. If they support fewer, return fewer. Never pad with things that were not said.`,
    "- An event or a special may appear twice: once earlier in the week to announce it, and once on the day as a reminder. Both use the same facts.",
    "- Put each post on a day inside the week given. Use the day the speaker named. If they named none, spread the posts across the week.",
    "- postType is one of: special_of_the_day (one dish or drink), whats_on_this_week (an overview of the week, at most one, on Monday unless the speaker says otherwise), live_scene (what it is like right now, only if the speaker described a moment), event (a dated happening).",
    "- brief: the facts for that post copied from the notes, in the speaker's own words, as short as possible. No new facts.",
    "- place and subject are optional hints for choosing a photo, only if the speaker named a place or a thing. place values: deck, lake, garden, bar, dining_room, kitchen, rooms, exterior. subject values: food, drink, people, staff, event, empty_scene.",
    upcomingRules(args.today ?? args.weekDates[0]),
    "- The posts list is for this week only. The upcoming list is separate: put a dated event or launch there whether or not it also has a post this week.",
    "OUTPUT",
    'Return JSON only: {"posts": [{"date": "YYYY-MM-DD", "postType": string, "brief": string, "place": string[], "subject": string[]}], "upcoming": [{"kind": "event" | "launch", "title": string, "details": string, "startsOn": "YYYY-MM-DD", "endsOn": "YYYY-MM-DD" (optional), "time": "HH:MM" (optional)}], "undated": [string]}',
  ].join("\n");
  const user = [
    args.settings.venue_notes ? `VENUE NOTES: ${args.settings.venue_notes}` : "",
    `THE WEEK: ${days}`,
    "THE SPEAKER'S NOTES:",
    args.transcript.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

const PLACES = ["deck", "lake", "garden", "bar", "dining_room", "kitchen", "rooms", "exterior"];
const SUBJECTS = ["food", "drink", "people", "staff", "event", "empty_scene"];

export interface ParsedPlan {
  items: PlanItem[];
  /** Items dropped as invalid, in plain words, for the person to see. */
  dropped: string[];
  /** Dated events and launches for the Coming up list, checked. */
  upcoming: UpcomingCandidate[];
  /** Coming up items left out and why, and things mentioned with no date. */
  upcomingNotes: string[];
}

/**
 * Strict parse and tidy. Items on a day outside the week, of a type that is
 * not plannable, or with no brief are dropped (and reported), never repaired
 * by guessing. The rest are ordered by date, exact repeats removed, and
 * capped at seven.
 */
export function parsePlan(text: string, weekDates: string[], today: string = weekDates[0]): ParsedPlan {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new Error("The plan was not valid JSON");
  }
  const posts = (raw as { posts?: unknown })?.posts;
  if (!Array.isArray(posts)) throw new Error("The plan had no posts list");

  const dropped: string[] = [];
  const items: PlanItem[] = [];
  const seen = new Set<string>();

  for (const p of posts) {
    const r = (p ?? {}) as Record<string, unknown>;
    const date = typeof r.date === "string" ? r.date : "";
    const type = r.postType;
    const brief = typeof r.brief === "string" ? r.brief.trim().replace(/\s+/g, " ").slice(0, 600) : "";
    if (!weekDates.includes(date)) {
      dropped.push(`A post on ${date || "no date"} was outside the week.`);
      continue;
    }
    if (!(PLANNABLE_TYPES as readonly string[]).includes(type as string)) {
      dropped.push(`A post of an unknown kind was left out.`);
      continue;
    }
    if (!brief) {
      dropped.push(`A ${String(type).replace(/_/g, " ")} on ${dayNameOf(date)} had nothing to say and was left out.`);
      continue;
    }
    const key = `${date}|${type}|${brief.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pick = (v: unknown, allowed: string[]) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)).slice(0, 3) : [];
    items.push({
      date,
      postType: type as PlannableType,
      brief,
      place: pick(r.place, PLACES),
      subject: pick(r.subject, SUBJECTS),
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  if (items.length > MAX_POSTS) {
    dropped.push(`${items.length - MAX_POSTS} more were left out to keep the week to ${MAX_POSTS} posts.`);
    items.length = MAX_POSTS;
  }
  const r = raw as { upcoming?: unknown; undated?: unknown };
  const upcoming = validateUpcoming(r.upcoming, today, r.undated);
  return { items, dropped, upcoming: upcoming.items, upcomingNotes: upcoming.notes };
}

/** A note for the person when the dictation did not support a full week. */
export function shortfallNote(count: number, upcomingCount = 0): string | null {
  if (count === 0 && upcomingCount > 0) return null;
  if (count === 0) return "We could not find anything to post about in that. Try again and say what is happening, day by day.";
  if (count < MIN_POSTS) return `We found ${count} ${count === 1 ? "thing" : "things"} to post about. Say a little more if you want ${MIN_POSTS} to ${MAX_POSTS} for the week.`;
  return null;
}
