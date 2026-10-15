import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPostType } from "@/lib/constants/post-types";
import { generateHospitalityPost, type GeneratedHospitalityPost } from "@/lib/hospitality/generate";
import { createHospitalityDraft, type DraftInput, type DraftResult } from "@/lib/hospitality/drafts";
import { notifyDraftFailed, notifyDraftReady } from "@/lib/hospitality/notify";
import { readSettings } from "@/lib/hospitality/prompts";
import { addDays, longDateLabel, todayIn } from "@/lib/hospitality/week";
import { buildSlotBrief, dueSlots, ITEM_COLUMNS, postTypeForItem, readyHeadline, SLOT_LABEL, toItem, type CalendarItem, type DueSlot, type SlotKind } from "@/lib/hospitality/coming-up";
import { selectImages, type LibraryCandidate } from "@/lib/media/select-images";
import { fetchDailyForecast } from "./open-meteo";
import { summariseForecast, type DailyForecast, type WeatherSummary } from "./map";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface WeatherCompany {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  hospitality_settings: unknown;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  weather_post_time: string | null;
  weather_post_for: string | null;
}

/** The day's photos: the best match first, plus up to two more that also suit the weather. */
export function chooseWeatherImages(
  candidates: LibraryCandidate[],
  summary: WeatherSummary,
  rng: () => number = Math.random
): string[] {
  const picks = selectImages(
    candidates,
    { weather: summary.weatherTags, place: summary.placeTags, subject: ["empty_scene"], avoidPeople: true },
    { count: 3, rng }
  );
  if (picks.length === 0) return [];
  const suits = (c: LibraryCandidate) =>
    c.tags.some((t) => t.startsWith("weather:") && summary.weatherTags.slice(0, 2).includes(t.slice("weather:".length)));
  return [picks[0], ...picks.slice(1).filter(suits)].map((c) => c.id);
}

export interface WeatherPorts {
  existingRun(companyId: string, date: string): Promise<{ status: "drafted" | "failed" } | null>;
  /** Returns false when another run already holds this day. */
  claim(companyId: string, date: string): Promise<boolean>;
  record(companyId: string, date: string, outcome: { status: "drafted" | "failed"; pieceId?: string; forecast?: DailyForecast; error?: string }): Promise<void>;
  candidates(companyId: string): Promise<LibraryCandidate[]>;
  forecast(args: { latitude: number; longitude: number; timeZone: string; date: string }): Promise<DailyForecast>;
  write(company: WeatherCompany, summary: WeatherSummary, date: string): Promise<GeneratedHospitalityPost>;
  draft(input: DraftInput): Promise<DraftResult>;
  notify(args: { companyId: string; pieceId: string; headline: string; preview: string }): Promise<unknown>;
  /** Tell the venue and AGENCY that the draft failed. Optional so test ports need not supply it. */
  notifyFailure?(args: { companyId: string; companyName: string; date: string; reason: string }): Promise<unknown>;
  /**
   * The Coming up items that may have a post due on a date (active ones near
   * it). Optional: without it the job writes the weather post as it always did.
   */
  dueItems?(companyId: string, date: string): Promise<CalendarItem[]>;
  /** Whether a draft already exists for this item and slot, so none is written twice. */
  slotDrafted?(companyId: string, itemId: string, slot: SlotKind): Promise<boolean>;
  /** Write an item's post. Required when dueItems is supplied. */
  writeItem?(company: WeatherCompany, args: { item: CalendarItem; slot: SlotKind; date: string; postTypeSlug: string; brief: string; forecastFacts: string | null }): Promise<GeneratedHospitalityPost>;
}

export type WeatherOutcome =
  | { company: string; status: "drafted"; date: string; pieceId: string; photos: number; calendarItemId?: string; slot?: SlotKind }
  | { company: string; status: "exists" | "skipped" | "failed"; date?: string; reason: string };

export async function runWeatherPostForCompany(
  company: WeatherCompany,
  ports: WeatherPorts,
  now: Date = new Date(),
  rng: () => number = Math.random
): Promise<WeatherOutcome> {
  const tz = company.timezone || "Europe/London";
  const localToday = todayIn(tz, now);
  const date = company.weather_post_for === "tomorrow" ? addDays(localToday, 1) : localToday;
  const hasPosition = company.latitude !== null && company.longitude !== null;

  // One automatic post a day: a Coming up item due that date takes the slot.
  // The weather post is the default when nothing is due.
  // Never the same item and slot twice: a rerun or a retry skips one already drafted.
  const open: DueSlot[] = [];
  if (ports.dueItems && ports.writeItem) {
    for (const d of dueSlots(await ports.dueItems(company.id, date), date)) {
      if (!(ports.slotDrafted && (await ports.slotDrafted(company.id, d.item.id, d.slot)))) open.push(d);
    }
  }

  // A company with no position is never guessed at. Without an item due it
  // is skipped and reported; an item's post does not need the forecast.
  if (!hasPosition && open.length === 0) {
    return { company: company.name, status: "skipped", reason: "No position set. Add a postcode in the venue settings." };
  }

  const run = await ports.existingRun(company.id, date);
  if (run?.status === "drafted") return { company: company.name, status: "exists", date, reason: "Already drafted for this date" };
  if (!(await ports.claim(company.id, date))) {
    return { company: company.name, status: "exists", date, reason: "Another run is already doing this date" };
  }

  try {
    if (open.length > 0) return await draftItemPost(company, ports, date, open, hasPosition, tz, rng);

    // hasPosition was checked above: with nothing due, a venue without one never gets here.
    const forecast = await ports.forecast({ latitude: company.latitude as number, longitude: company.longitude as number, timeZone: tz, date });
    const summary = summariseForecast(forecast);
    const post = await ports.write(company, summary, date);
    const imageIds = chooseWeatherImages(await ports.candidates(company.id), summary, rng);

    const draft = await ports.draft({
      companyId: company.id,
      postTypeSlug: "weather_of_the_day",
      title: `Weather, ${longDateLabel(date)}`,
      body: post.body,
      scheduledDate: date,
      scheduledTime: company.weather_post_time || "07:00",
      autoSource: "weather_job",
      sourceMeta: {
        forecast,
        weather_tags: summary.weatherTags,
        facts: summary.facts,
        alt_text: post.altText,
        warnings: [
          ...post.warnings,
          ...(imageIds.length === 0 ? ["No photo in the library suited today's weather. Choose one."] : []),
        ],
        image_ids: imageIds,
        provider: post.provider,
      },
      imageIds,
    });
    await ports.record(company.id, date, { status: "drafted", pieceId: draft.pieceId, forecast });
    await ports.notify({
      companyId: company.id,
      pieceId: draft.pieceId,
      headline: `${company.weather_post_for === "tomorrow" ? "Tomorrow's" : "Today's"} weather post is ready for you to approve`,
      preview: post.caption,
    });
    return { company: company.name, status: "drafted", date, pieceId: draft.pieceId, photos: draft.imagesAttached };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await ports.record(company.id, date, { status: "failed", error: message.slice(0, 500) });
    // A silent failure left the home page promising a post that never came
    // (audit, 14 Oct 2026). Say so to the venue, and send the reason to AGENCY.
    try {
      await ports.notifyFailure?.({ companyId: company.id, companyName: company.name, date, reason: message });
    } catch (notifyErr) {
      console.error("[weather] failure notice did not send:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }
    return { company: company.name, status: "failed", date, reason: message };
  }
}

/**
 * The day's post is a Coming up item's: the first in the tie-break order
 * (the nearer event wins). Any other item due the same day is named in the
 * draft's warnings. The forecast is a nice-to-have here: if it cannot be had,
 * the post is written without it.
 */
async function draftItemPost(
  company: WeatherCompany,
  ports: WeatherPorts,
  date: string,
  open: DueSlot[],
  hasPosition: boolean,
  timeZone: string,
  rng: () => number
): Promise<WeatherOutcome> {
  const [chosen, ...others] = open;
  const { item, slot } = chosen;
  let forecast: DailyForecast | undefined;
  let facts: string | null = null;
  if (hasPosition) {
    try {
      forecast = await ports.forecast({ latitude: company.latitude as number, longitude: company.longitude as number, timeZone, date });
      facts = summariseForecast(forecast).facts;
    } catch (err) {
      console.warn("[weather] forecast unavailable for an item post:", err instanceof Error ? err.message : err);
    }
  }
  const postTypeSlug = postTypeForItem(item);
  const brief = buildSlotBrief(item, slot, Boolean(facts));
  const post = await ports.writeItem!(company, { item, slot, date, postTypeSlug, brief, forecastFacts: facts });

  const q = getPostType(postTypeSlug)?.libraryQuery;
  const picked = selectImages(await ports.candidates(company.id), { place: q?.place, subject: q?.subject, avoidPeople: q?.avoidPeople ?? true }, { count: 1, rng });
  const imageIds = picked.map((c) => c.id);

  const draft = await ports.draft({
    companyId: company.id,
    postTypeSlug,
    title: `${item.title}, ${longDateLabel(date)}`,
    body: post.body,
    scheduledDate: date,
    scheduledTime: company.weather_post_time || "07:00",
    autoSource: "weather_job",
    sourceMeta: {
      calendar_item_id: item.id,
      slot,
      brief,
      ...(forecast ? { forecast, facts } : {}),
      alt_text: post.altText,
      warnings: [
        ...post.warnings,
        ...others.map((o) => `${o.item.title} also had a post due today (${SLOT_LABEL[o.slot].toLowerCase()}). Only one automatic post goes out a day, so it was left out.`),
        ...(imageIds.length === 0 ? ["No photo in the library suited this post. Choose one."] : []),
      ],
      image_ids: imageIds,
      provider: post.provider,
    },
    imageIds,
  });
  await ports.record(company.id, date, { status: "drafted", pieceId: draft.pieceId, forecast });
  await ports.notify({ companyId: company.id, pieceId: draft.pieceId, headline: readyHeadline(item), preview: post.caption });
  return { company: company.name, status: "drafted", date, pieceId: draft.pieceId, photos: draft.imagesAttached, calendarItemId: item.id, slot };
}

/** The real ports: Supabase for storage, the forecast service, the writer, email. */
export function realPorts(supabase: SupabaseAdmin): WeatherPorts {
  return {
    async existingRun(companyId, date) {
      const { data } = await supabase.from("weather_post_runs").select("status").eq("company_id", companyId).eq("target_date", date).maybeSingle();
      return (data as { status: "drafted" | "failed" } | null) ?? null;
    },
    async claim(companyId, date) {
      const { error } = await supabase
        .from("weather_post_runs")
        .insert({ company_id: companyId, target_date: date, status: "failed", error: "running" });
      if (!error) return true;
      if (error.code !== "23505") throw new Error(`Could not start the run: ${error.message}`);
      // A row exists. It is a retry if the last attempt failed and is not still running.
      const { data } = await supabase.from("weather_post_runs").select("status, error, updated_at").eq("company_id", companyId).eq("target_date", date).maybeSingle();
      if (!data || data.status !== "failed") return false;
      const stillRunning = data.error === "running" && Date.now() - Date.parse(data.updated_at as string) < 10 * 60 * 1000;
      if (stillRunning) return false;
      await supabase.from("weather_post_runs").update({ error: "running", updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("target_date", date);
      return true;
    },
    async record(companyId, date, outcome) {
      await supabase
        .from("weather_post_runs")
        .update({
          status: outcome.status,
          content_piece_id: outcome.pieceId ?? null,
          forecast: outcome.forecast ?? null,
          error: outcome.error ?? null,
        })
        .eq("company_id", companyId)
        .eq("target_date", date);
    },
    async candidates(companyId) {
      const { data } = await supabase
        .from("photo_inventory")
        .select("id, kind, tags, people_present, last_used_at, used_in_weeks, status")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .eq("kind", "photo")
        .limit(2000);
      return (data || []) as LibraryCandidate[];
    },
    forecast: (args) => fetchDailyForecast(args),
    write: (company, summary, date) =>
      generateHospitalityPost({
        company: { name: company.name, industry: company.industry, description: company.description, settings: readSettings(company.hospitality_settings) },
        postType: getPostType("weather_of_the_day")!,
        brief: "",
        forecastFacts: summary.facts,
        dateLabel: longDateLabel(date),
      }),
    draft: (input) => createHospitalityDraft(supabase, input),
    notify: (args) => notifyDraftReady(supabase, args),
    notifyFailure: (args) => notifyDraftFailed(supabase, { ...args, what: "The weather post" }),
    async dueItems(companyId, date) {
      // An event's posts fall up to seven days before it; a launch's while it runs.
      const { data, error } = await supabase
        .from("venue_calendar_items")
        .select(ITEM_COLUMNS)
        .eq("company_id", companyId)
        .eq("status", "active")
        .lte("starts_on", addDays(date, 7))
        .or(`starts_on.gte.${date},ends_on.gte.${date}`);
      // A missing table (before migration 046) must not stop the weather post.
      if (error) {
        console.warn("[weather] could not read Coming up:", error.message);
        return [];
      }
      return ((data || []) as Record<string, unknown>[]).map(toItem);
    },
    async slotDrafted(companyId, itemId, slot) {
      const { data } = await supabase
        .from("content_pieces")
        .select("id")
        .eq("company_id", companyId)
        .contains("source_meta", { calendar_item_id: itemId, slot })
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    },
    writeItem: (company, args) =>
      generateHospitalityPost({
        company: { name: company.name, industry: company.industry, description: company.description, settings: readSettings(company.hospitality_settings) },
        postType: getPostType(args.postTypeSlug)!,
        brief: args.brief,
        forecastFacts: args.forecastFacts,
        dateLabel: longDateLabel(args.date),
      }),
  };
}

export async function runWeatherPosts(
  supabase: SupabaseAdmin,
  now: Date = new Date(),
  options: { companyId?: string } = {}
): Promise<WeatherOutcome[]> {
  let query = supabase
    .from("companies")
    .select("id, name, industry, description, hospitality_settings, latitude, longitude, timezone, weather_post_time, weather_post_for")
    .eq("weather_post_enabled", true)
    .eq("post_pack", "hospitality");
  // A manual run can be scoped to one company; the daily cron passes nothing.
  if (options.companyId) query = query.eq("id", options.companyId);
  const { data } = await query;
  const ports = realPorts(supabase);
  const out: WeatherOutcome[] = [];
  // One company at a time: each makes a forecast call and a writing call.
  for (const company of (data || []) as WeatherCompany[]) {
    out.push(await runWeatherPostForCompany(company, ports, now));
  }
  return out;
}
