import { describe, expect, it } from "vitest";
import { conditionOf, summariseForecast, type DailyForecast } from "./map";
import { fetchDailyForecast, parseDaily } from "./open-meteo";
import { TAG_VOCABULARY } from "@/lib/media/vocabulary";

const day = (over: Partial<DailyForecast>): DailyForecast => ({
  date: "2026-10-14", weatherCode: 0, tempMax: 18, tempMin: 9, precipitationMm: 0, precipitationChance: 5, windMaxMph: 8, sunrise: "07:30", sunset: "18:16", ...over,
});

describe("conditionOf (WMO codes)", () => {
  it("groups the codes the way the forecast defines them", () => {
    expect(conditionOf(0)).toBe("clear");
    expect(conditionOf(1)).toBe("clear");
    expect(conditionOf(2)).toBe("partly_cloudy");
    expect(conditionOf(3)).toBe("overcast");
    expect(conditionOf(45)).toBe("fog");
    expect(conditionOf(48)).toBe("fog");
    for (const c of [51, 53, 55, 56, 57]) expect(conditionOf(c)).toBe("drizzle");
    for (const c of [61, 63, 65, 66, 67, 80, 81, 82]) expect(conditionOf(c)).toBe("rain");
    for (const c of [71, 73, 75, 77, 85, 86]) expect(conditionOf(c)).toBe("snow");
    for (const c of [95, 96, 99]) expect(conditionOf(c)).toBe("thunder");
  });
  it("treats an unknown code as plain cloud, not as sun", () => {
    expect(conditionOf(123)).toBe("overcast");
  });
});

describe("summariseForecast: forecast to library vocabulary", () => {
  it("asks for sunny first on a warm clear day, and outdoor places", () => {
    const s = summariseForecast(day({ weatherCode: 0, tempMax: 21 }));
    expect(s.weatherTags[0]).toBe("sunny");
    expect(s.placeTags.slice(0, 3)).toEqual(["deck", "lake", "garden"]);
    expect(s.outdoors).toBe(true);
  });
  it("asks for bright first on a cool clear day", () => {
    expect(summariseForecast(day({ weatherCode: 1, tempMax: 12 })).weatherTags.slice(0, 2)).toEqual(["bright", "sunny"]);
  });
  it("asks for rain, then grey, and indoor places, on a wet day", () => {
    const s = summariseForecast(day({ weatherCode: 63, tempMax: 13 }));
    expect(s.weatherTags).toEqual(["rain", "grey", "overcast", "indoor"]);
    expect(s.placeTags[0]).toBe("dining_room");
    expect(s.outdoors).toBe(false);
  });
  it("treats thunder and drizzle as rain", () => {
    expect(summariseForecast(day({ weatherCode: 95 })).weatherTags[0]).toBe("rain");
    expect(summariseForecast(day({ weatherCode: 51 })).weatherTags[0]).toBe("rain");
  });
  it("asks for snow, then frost, on a snowy day", () => {
    expect(summariseForecast(day({ weatherCode: 73, tempMax: 1, tempMin: -3 })).weatherTags.slice(0, 2)).toEqual(["snow", "frost"]);
  });
  it("puts frost first on a dry day that falls to freezing", () => {
    const s = summariseForecast(day({ weatherCode: 1, tempMax: 6, tempMin: -2 }));
    expect(s.weatherTags[0]).toBe("frost");
    expect(s.placeTags[0]).toBe("exterior");
  });
  it("does not call a wet day frosty", () => {
    expect(summariseForecast(day({ weatherCode: 61, tempMin: -1 })).weatherTags[0]).toBe("rain");
  });
  it("asks for grey or overcast on a cloudy day and for grey in fog", () => {
    expect(summariseForecast(day({ weatherCode: 3, tempMax: 13 })).weatherTags[0]).toBe("overcast");
    expect(summariseForecast(day({ weatherCode: 45, tempMax: 11 })).weatherTags[0]).toBe("grey");
  });
  it("only ever asks for tags that exist in the library vocabulary, and never for dusk or night", () => {
    for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 80, 95, 123]) {
      for (const [tMax, tMin] of [[20, 10], [5, -3]]) {
        const s = summariseForecast(day({ weatherCode: code, tempMax: tMax, tempMin: tMin }));
        for (const t of s.weatherTags) expect(TAG_VOCABULARY.weather as readonly string[]).toContain(t);
        expect(s.weatherTags).not.toContain("dusk");
        expect(s.weatherTags).not.toContain("night");
        for (const p of s.placeTags) expect(TAG_VOCABULARY.place as readonly string[]).toContain(p);
      }
    }
  });
  it("states the forecast as exact figures and nothing else", () => {
    const s = summariseForecast(day({ weatherCode: 61, tempMax: 13.6, tempMin: 7.2, precipitationMm: 3.54, precipitationChance: 73, windMaxMph: 16.8 }));
    expect(s.facts).toBe("rain, high 14C, low 7C, chance of rain 73 percent, about 3.5 mm of rain, wind up to 17 mph, sunrise 07:30, sunset 18:16");
  });
  it("leaves out rainfall when it is negligible", () => {
    expect(summariseForecast(day({ weatherCode: 51, precipitationMm: 0.1 })).facts).not.toMatch(/mm of rain/);
  });
});

describe("parseDaily", () => {
  const json = { daily: { time: ["2026-10-14"], weather_code: [51], temperature_2m_max: [16.2], temperature_2m_min: [8.6], precipitation_sum: [0.1], precipitation_probability_max: [18], wind_speed_10m_max: [13.4], sunrise: ["2026-10-14T07:30"], sunset: ["2026-10-14T18:16"] } };
  it("reads the live response shape", () => {
    expect(parseDaily(json, "2026-10-14")).toMatchObject({ weatherCode: 51, tempMax: 16.2, tempMin: 8.6, sunrise: "07:30", sunset: "18:16", precipitationChance: 18 });
  });
  it("refuses a response without the date or without the weather", () => {
    expect(() => parseDaily(json, "2026-10-15")).toThrow(/did not include that date/);
    expect(() => parseDaily({ daily: { ...json.daily, weather_code: [null as never] } }, "2026-10-14")).toThrow(/missing/);
    expect(() => parseDaily({}, "2026-10-14")).toThrow();
  });
});

describe("fetchDailyForecast", () => {
  it("asks for one date at the company's position and time zone", async () => {
    let seen = "";
    const fetcher = (async (u: string) => {
      seen = u;
      return new Response(JSON.stringify({ daily: { time: ["2026-10-14"], weather_code: [3], temperature_2m_max: [12], temperature_2m_min: [6] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const f = await fetchDailyForecast({ latitude: 51.668461, longitude: -1.911393, timeZone: "Europe/London", date: "2026-10-14" }, fetcher);
    expect(f.weatherCode).toBe(3);
    expect(seen).toContain("latitude=51.6685");
    expect(seen).toContain("timezone=Europe%2FLondon");
    expect(seen).toContain("start_date=2026-10-14");
    expect(seen).toContain("end_date=2026-10-14");
  });
  it("throws when the service stays down", async () => {
    const fetcher = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchDailyForecast({ latitude: 1, longitude: 1, timeZone: "UTC", date: "2026-10-14" }, fetcher, 0)).rejects.toThrow(/503/);
  });
  it("tries again after a rate limit or a dropped connection, so one blip does not cost the day's post", async () => {
    const ok = JSON.stringify({ daily: { time: ["2026-10-14"], weather_code: [1], temperature_2m_max: [15], temperature_2m_min: [8] } });
    let n = 0;
    const fetcher = (async () => {
      n += 1;
      if (n === 1) throw new TypeError("fetch failed");
      if (n === 2) return new Response("slow down", { status: 429 });
      return new Response(ok, { status: 200 });
    }) as unknown as typeof fetch;
    const f = await fetchDailyForecast({ latitude: 1, longitude: 1, timeZone: "UTC", date: "2026-10-14" }, fetcher, 0);
    expect(f.weatherCode).toBe(1);
    expect(n).toBe(3);
  });
  it("does not retry a refusal that will not change", async () => {
    let n = 0;
    const fetcher = (async () => { n += 1; return new Response("bad request", { status: 400 }); }) as unknown as typeof fetch;
    await expect(fetchDailyForecast({ latitude: 1, longitude: 1, timeZone: "UTC", date: "2026-10-14" }, fetcher, 0)).rejects.toThrow(/400/);
    expect(n).toBe(1);
  });
});
