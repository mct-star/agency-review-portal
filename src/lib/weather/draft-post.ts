import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPostType } from "@/lib/constants/post-types";
import { generateHospitalityPost, type GeneratedHospitalityPost } from "@/lib/hospitality/generate";
import { createHospitalityDraft, type DraftInput, type DraftResult } from "@/lib/hospitality/drafts";
import { notifyDraftReady } from "@/lib/hospitality/notify";
import { readSettings } from "@/lib/hospitality/prompts";
import { addDays, longDateLabel, todayIn } from "@/lib/hospitality/week";
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
}

export type WeatherOutcome =
  | { company: string; status: "drafted"; date: string; pieceId: string; photos: number }
  | { company: string; status: "exists" | "skipped" | "failed"; date?: string; reason: string };

export async function runWeatherPostForCompany(
  company: WeatherCompany,
  ports: WeatherPorts,
  now: Date = new Date(),
  rng: () => number = Math.random
): Promise<WeatherOutcome> {
  // A company with no position is never guessed at. It is skipped and reported.
  if (company.latitude === null || company.longitude === null) {
    return { company: company.name, status: "skipped", reason: "No position set. Add a postcode in the venue settings." };
  }
  const tz = company.timezone || "Europe/London";
  const localToday = todayIn(tz, now);
  const date = company.weather_post_for === "tomorrow" ? addDays(localToday, 1) : localToday;

  const run = await ports.existingRun(company.id, date);
  if (run?.status === "drafted") return { company: company.name, status: "exists", date, reason: "Already drafted for this date" };
  if (!(await ports.claim(company.id, date))) {
    return { company: company.name, status: "exists", date, reason: "Another run is already doing this date" };
  }

  try {
    const forecast = await ports.forecast({ latitude: company.latitude, longitude: company.longitude, timeZone: tz, date });
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
    return { company: company.name, status: "failed", date, reason: message };
  }
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
  };
}

export async function runWeatherPosts(supabase: SupabaseAdmin, now: Date = new Date()): Promise<WeatherOutcome[]> {
  const { data } = await supabase
    .from("companies")
    .select("id, name, industry, description, hospitality_settings, latitude, longitude, timezone, weather_post_time, weather_post_for")
    .eq("weather_post_enabled", true)
    .eq("post_pack", "hospitality");
  const ports = realPorts(supabase);
  const out: WeatherOutcome[] = [];
  // One company at a time: each makes a forecast call and a writing call.
  for (const company of (data || []) as WeatherCompany[]) {
    out.push(await runWeatherPostForCompany(company, ports, now));
  }
  return out;
}
