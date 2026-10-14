/**
 * What the hospitality home page says, as plain functions so the wording and
 * the arithmetic can be tested without a page.
 */
import { addDays, hhmm, longDateLabel, todayIn } from "./week";
import { isValidTimeZone } from "./settings";

/**
 * The daily weather job runs at 04:00 UTC (vercel.json, "0 4 * * *"), so a
 * draft is ready before a 07:00 post time all year. home.test.ts checks this
 * number against vercel.json, so they cannot drift apart.
 */
export const WEATHER_CRON_UTC_HOUR = 4;

export interface WeatherSettings {
  weather_post_enabled?: boolean | null;
  weather_post_time?: string | null;
  weather_post_for?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const zoneOf = (tz: string | null | undefined) => (tz && isValidTimeZone(tz) ? tz : "Europe/London");

function nextCronRun(now: Date): Date {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WEATHER_CRON_UTC_HOUR, 0, 0));
  return today.getTime() > now.getTime() ? today : new Date(today.getTime() + 86_400_000);
}

export interface NextWeatherDraft {
  /** HH:MM in the venue's own time. */
  runTime: string;
  runDay: string;
  /** The time the post is scheduled for, HH:MM. */
  postTime: string;
  targetDay: string;
}

/** When the next weather post is drafted, and which day it is for. Null when the post is off. */
export function nextWeatherDraft(settings: WeatherSettings, now: Date = new Date()): NextWeatherDraft | null {
  if (!settings.weather_post_enabled) return null;
  const tz = zoneOf(settings.timezone);
  const run = nextCronRun(now);
  const runDate = todayIn(tz, run);
  const targetDate = settings.weather_post_for === "tomorrow" ? addDays(runDate, 1) : runDate;
  const runTime = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(run);
  return {
    runTime,
    runDay: longDateLabel(runDate),
    postTime: hhmm(settings.weather_post_time || "07:00"),
    targetDay: longDateLabel(targetDate),
  };
}

/** The one line about the weather post, or null when it is switched off. */
export function weatherLine(settings: WeatherSettings, now: Date = new Date()): string | null {
  if (!settings.weather_post_enabled) return null;
  // The job never guesses a position, so without a postcode nothing is drafted.
  if (settings.latitude == null || settings.longitude == null) {
    return "The weather post is on, but it needs your postcode before it can be drafted. Add it under Venue and posting.";
  }
  const next = nextWeatherDraft(settings, now);
  if (!next) return null;
  const when = next.targetDay === next.runDay ? "that day" : `on ${next.targetDay}`;
  return `Next weather post: drafted around ${next.runTime} on ${next.runDay}, for ${next.postTime} ${when}. It will wait for you to approve it.`;
}

/** "Good morning, Sam." by the venue's own clock. */
export function greetingFor(firstName: string, now: Date, timeZone: string | null | undefined): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zoneOf(timeZone), hour: "2-digit", hourCycle: "h23" }).format(now));
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${firstName}.`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sentence on the Waiting for you card. */
export function postsWaitingLine(posts: number, photos: number): string {
  if (posts === 0 && photos === 0) return "Nothing is waiting. You are up to date.";
  if (posts === 0) return `${plural(photos, "photo from your team is", "photos from your team are")} waiting for you to look at.`;
  const lead = `${plural(posts, "post is", "posts are")} waiting for you to approve`;
  return photos > 0 ? `${lead}, and ${plural(photos, "photo", "photos")} from your team to look at.` : `${lead}.`;
}
