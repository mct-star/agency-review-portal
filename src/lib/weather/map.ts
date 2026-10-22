/**
 * From a day's forecast to the photo library's weather vocabulary.
 *
 * Open-Meteo reports a WMO weather code and a few daily figures. The library
 * describes photos with ten weather tags (sunny, bright, grey, overcast, rain,
 * frost, snow, dusk, night, indoor). This maps one to the other as a ranked
 * list, best first, so a day with no sunny photo falls back to a bright one.
 * dusk and night describe the light in a photo, not a forecast, so a daily
 * forecast never asks for them.
 */

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationMm: number;
  precipitationChance: number | null;
  windMaxMph: number | null;
  sunrise: string | null; // HH:MM local
  sunset: string | null;
}

export type Condition = "clear" | "partly_cloudy" | "overcast" | "fog" | "drizzle" | "rain" | "thunder" | "snow";

export function conditionOf(code: number): Condition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly_cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 95 && code <= 99) return "thunder";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  // An unknown code is treated as plain cloud rather than guessed at.
  return "overcast";
}

const CONDITION_TEXT: Record<Condition, string> = {
  clear: "clear and sunny",
  partly_cloudy: "partly cloudy",
  overcast: "overcast",
  fog: "foggy",
  drizzle: "light drizzle",
  rain: "rain",
  thunder: "thundery showers",
  snow: "snow",
};

export interface WeatherSummary {
  condition: Condition;
  /** Library weather tags, best match first. */
  weatherTags: string[];
  /** Library place tags that suit this weather, best first. */
  placeTags: string[];
  /** Whether the weather is good enough that a post should talk about being outside. */
  outdoors: boolean;
  /** The forecast in plain words with exact figures, handed to the writer as the only facts it may use. */
  facts: string;
}

const round = (n: number) => Math.round(n);

export function summariseForecast(f: DailyForecast): WeatherSummary {
  const condition = conditionOf(f.weatherCode);
  const dry = condition === "clear" || condition === "partly_cloudy" || condition === "overcast" || condition === "fog";
  const frosty = dry && f.tempMin <= 0;

  let weatherTags: string[];
  switch (condition) {
    case "clear":
      weatherTags = f.tempMax >= 17 ? ["sunny", "bright"] : ["bright", "sunny"];
      break;
    case "partly_cloudy":
      weatherTags = ["bright", "sunny", "overcast"];
      break;
    case "overcast":
      weatherTags = ["overcast", "grey", "bright"];
      break;
    case "fog":
      weatherTags = ["grey", "overcast", "indoor"];
      break;
    case "drizzle":
    case "rain":
    case "thunder":
      weatherTags = ["rain", "grey", "overcast", "indoor"];
      break;
    case "snow":
      weatherTags = ["snow", "frost", "grey", "overcast", "indoor"];
      break;
  }
  if (frosty) weatherTags = ["frost", ...weatherTags.filter((t) => t !== "frost")];

  const outdoors = (condition === "clear" || condition === "partly_cloudy") && f.tempMax >= 10;
  const placeTags = outdoors
    ? ["deck", "lake", "garden", "exterior", "bar", "dining_room"]
    : condition === "snow" || frosty
      ? ["exterior", "lake", "garden", "dining_room", "bar"]
      : ["dining_room", "bar", "kitchen", "rooms", "exterior"];

  const parts = [`${CONDITION_TEXT[condition]}`, `high ${round(f.tempMax)}C`, `low ${round(f.tempMin)}C`];
  if (f.precipitationChance !== null) parts.push(`chance of rain ${round(f.precipitationChance)} percent`);
  if (f.precipitationMm >= 0.5) parts.push(`about ${f.precipitationMm.toFixed(1)} mm of rain`);
  if (f.windMaxMph !== null) parts.push(`wind up to ${round(f.windMaxMph)} mph`);
  if (f.sunrise) parts.push(`sunrise ${f.sunrise}`);
  if (f.sunset) parts.push(`sunset ${f.sunset}`);

  return { condition, weatherTags, placeTags, outdoors, facts: parts.join(", ") };
}
