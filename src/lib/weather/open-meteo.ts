import type { DailyForecast } from "./map";

/**
 * Today's or tomorrow's forecast from Open-Meteo: free, no key. One call for
 * one position and one date. Throws on any failure so the job records it and
 * retries on its next run; a missing forecast is never papered over.
 */

type Fetcher = typeof fetch;

export async function fetchDailyForecast(
  args: { latitude: number; longitude: number; timeZone: string; date: string },
  fetcher: Fetcher = fetch,
  retryDelayMs = 1500
): Promise<DailyForecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", args.latitude.toFixed(4));
  url.searchParams.set("longitude", args.longitude.toFixed(4));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset"
  );
  url.searchParams.set("timezone", args.timeZone);
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("start_date", args.date);
  url.searchParams.set("end_date", args.date);

  // The cron runs once a day, so one transient failure must not cost the day's
  // post: try again after a short pause on a network error, a 429 or a 5xx.
  let res: Response | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    try {
      res = await fetcher(url.toString(), { headers: { Accept: "application/json" } });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "network error";
      res = null;
      continue;
    }
    if (res.ok) break;
    lastError = `Forecast service answered ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  if (!res || !res.ok) throw new Error(lastError || "The forecast service did not answer");
  const json = (await res.json()) as { daily?: Record<string, unknown[]> };
  return parseDaily(json, args.date);
}

export function parseDaily(json: { daily?: Record<string, unknown[]> }, date: string): DailyForecast {
  const d = json.daily;
  const i = d?.time?.indexOf(date) ?? -1;
  if (!d || i < 0) throw new Error("The forecast did not include that date");
  const num = (key: string): number | null => {
    const v = d[key]?.[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const code = num("weather_code");
  const tMax = num("temperature_2m_max");
  const tMin = num("temperature_2m_min");
  if (code === null || tMax === null || tMin === null) throw new Error("The forecast was missing the weather or temperatures");
  const hhmm = (key: string): string | null => {
    const v = d[key]?.[i];
    return typeof v === "string" && /T(\d{2}:\d{2})/.test(v) ? v.slice(v.indexOf("T") + 1, v.indexOf("T") + 6) : null;
  };
  return {
    date,
    weatherCode: code,
    tempMax: tMax,
    tempMin: tMin,
    precipitationMm: num("precipitation_sum") ?? 0,
    precipitationChance: num("precipitation_probability_max"),
    windMaxMph: num("wind_speed_10m_max"),
    sunrise: hhmm("sunrise"),
    sunset: hhmm("sunset"),
  };
}
