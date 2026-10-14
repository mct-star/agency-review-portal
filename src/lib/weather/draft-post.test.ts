import { describe, expect, it, vi } from "vitest";
import { chooseWeatherImages, runWeatherPostForCompany, type WeatherCompany, type WeatherPorts } from "./draft-post";
import { summariseForecast, type DailyForecast } from "./map";
import type { LibraryCandidate } from "@/lib/media/select-images";

const company: WeatherCompany = {
  id: "co1", name: "Lakeside", industry: null, description: null, hospitality_settings: {},
  latitude: 51.668461, longitude: -1.911393, timezone: "Europe/London", weather_post_time: "07:00:00", weather_post_for: "today",
};
const forecast = (over: Partial<DailyForecast> = {}): DailyForecast => ({
  date: "2026-10-14", weatherCode: 0, tempMax: 19, tempMin: 9, precipitationMm: 0, precipitationChance: 4, windMaxMph: 7, sunrise: "07:30", sunset: "18:16", ...over,
});
const photo = (id: string, tags: string[], over: Partial<LibraryCandidate> = {}): LibraryCandidate => ({
  id, kind: "photo", tags, people_present: false, last_used_at: null, used_in_weeks: [], status: "approved", ...over,
});
const fixed = () => 0.5;

function ports(over: Partial<WeatherPorts> = {}) {
  const log = { drafts: [] as unknown[], records: [] as unknown[], notified: [] as unknown[] };
  const p: WeatherPorts = {
    existingRun: vi.fn(async () => null),
    claim: vi.fn(async () => true),
    record: vi.fn(async (_c, _d, o) => void log.records.push(o)),
    candidates: vi.fn(async () => [photo("deck-sun", ["weather:sunny", "place:deck"]), photo("bar-rain", ["weather:rain", "place:bar"])]),
    forecast: vi.fn(async () => forecast()),
    write: vi.fn(async () => ({ body: "A lovely day.\n\n#sunny", caption: "A lovely day.", hashtags: ["#sunny"], altText: "A terrace", warnings: [], provider: "gemini" })),
    draft: vi.fn(async (i) => { log.drafts.push(i); return { pieceId: "piece1", weekId: "w1", imagesAttached: (i.imageIds ?? []).length }; }),
    notify: vi.fn(async (n) => void log.notified.push(n)),
    ...over,
  };
  return { p, log };
}

// 14 Oct 2026, 04:10 UTC = 05:10 in London.
const NOW = new Date("2026-10-14T04:10:00Z");

describe("chooseWeatherImages", () => {
  const sunny = summariseForecast(forecast());
  it("picks the photo that matches the weather and the place", () => {
    const ids = chooseWeatherImages([photo("rain", ["weather:rain", "place:bar"]), photo("sun", ["weather:sunny", "place:deck"])], sunny, fixed);
    expect(ids[0]).toBe("sun");
  });
  it("adds up to two more only if they suit the weather too", () => {
    const lib = [
      photo("a", ["weather:sunny", "place:deck"]),
      photo("b", ["weather:bright", "place:lake"]),
      photo("c", ["weather:rain", "place:bar"]),
      photo("d", ["subject:food"]),
    ];
    const ids = chooseWeatherImages(lib, sunny, fixed);
    expect(ids).toEqual(["a", "b"]);
  });
  it("prefers the photo used longest ago", () => {
    const lib = [photo("recent", ["weather:sunny", "place:deck"], { last_used_at: "2026-10-13T07:00:00Z" }), photo("old", ["weather:sunny", "place:deck"], { last_used_at: "2026-09-01T07:00:00Z" })];
    expect(chooseWeatherImages(lib, sunny, fixed)[0]).toBe("old");
  });
  it("never chooses a photo with a person in it", () => {
    const lib = [photo("crowd", ["weather:sunny", "place:deck", "subject:people"], { people_present: true }), photo("empty", ["weather:bright", "place:deck"])];
    expect(chooseWeatherImages(lib, sunny, fixed)).toEqual(["empty"]);
  });
  it("returns nothing from an empty library", () => {
    expect(chooseWeatherImages([], sunny, fixed)).toEqual([]);
  });
});

describe("runWeatherPostForCompany", () => {
  it("drafts today's post as pending-for-approval, scheduled for the post time, with a photo", async () => {
    const { p, log } = ports();
    const r = await runWeatherPostForCompany(company, p, NOW, fixed);
    expect(r).toMatchObject({ status: "drafted", date: "2026-10-14", pieceId: "piece1", photos: 1 });
    expect(log.drafts[0]).toMatchObject({
      companyId: "co1", postTypeSlug: "weather_of_the_day", scheduledDate: "2026-10-14", scheduledTime: "07:00:00",
      autoSource: "weather_job", imageIds: ["deck-sun"],
    });
    expect(log.records[0]).toMatchObject({ status: "drafted", pieceId: "piece1" });
    expect(log.notified).toHaveLength(1);
  });

  it("never approves or publishes: the draft goes through the draft writer that always starts pending", async () => {
    const { p } = ports();
    await runWeatherPostForCompany(company, p, NOW, fixed);
    const input = (p.draft as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect("approval_status" in input).toBe(false);
    expect(input.autoSource).toBe("weather_job");
  });

  it("gives the writer the forecast figures and nothing else to state", async () => {
    const { p } = ports();
    await runWeatherPostForCompany(company, p, NOW, fixed);
    const summary = (p.write as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(summary.facts).toContain("high 19C");
  });

  it("drafts tomorrow's forecast a day ahead when asked", async () => {
    const { p } = ports();
    await runWeatherPostForCompany({ ...company, weather_post_for: "tomorrow" }, p, NOW, fixed);
    expect((p.forecast as ReturnType<typeof vi.fn>).mock.calls[0][0].date).toBe("2026-10-15");
  });

  it("uses the company's own date, not the server's", async () => {
    const { p } = ports();
    // 23:30 UTC on the 14th is already the 15th in Auckland.
    await runWeatherPostForCompany({ ...company, timezone: "Pacific/Auckland" }, p, new Date("2026-10-14T23:30:00Z"), fixed);
    expect((p.forecast as ReturnType<typeof vi.fn>).mock.calls[0][0].date).toBe("2026-10-15");
  });

  it("does not draft the same date twice", async () => {
    const { p } = ports({ existingRun: vi.fn(async () => ({ status: "drafted" as const })) });
    expect(await runWeatherPostForCompany(company, p, NOW, fixed)).toMatchObject({ status: "exists" });
    expect(p.draft).not.toHaveBeenCalled();
  });

  it("does not run twice at once", async () => {
    const { p } = ports({ claim: vi.fn(async () => false) });
    expect(await runWeatherPostForCompany(company, p, NOW, fixed)).toMatchObject({ status: "exists" });
    expect(p.forecast).not.toHaveBeenCalled();
  });

  it("retries a day whose last attempt failed", async () => {
    const { p } = ports({ existingRun: vi.fn(async () => ({ status: "failed" as const })) });
    expect(await runWeatherPostForCompany(company, p, NOW, fixed)).toMatchObject({ status: "drafted" });
  });

  it("skips and reports a company with no position instead of guessing", async () => {
    const { p } = ports();
    const r = await runWeatherPostForCompany({ ...company, latitude: null, longitude: null }, p, NOW, fixed);
    expect(r).toMatchObject({ status: "skipped" });
    expect((r as { reason: string }).reason).toMatch(/postcode/);
    expect(p.forecast).not.toHaveBeenCalled();
  });

  it("records a failure and drafts nothing when the forecast service is down", async () => {
    const { p, log } = ports({ forecast: vi.fn(async () => { throw new Error("Forecast service answered 503"); }) });
    const r = await runWeatherPostForCompany(company, p, NOW, fixed);
    expect(r).toMatchObject({ status: "failed" });
    expect(p.draft).not.toHaveBeenCalled();
    expect(log.records[0]).toMatchObject({ status: "failed", error: "Forecast service answered 503" });
    expect(log.notified).toHaveLength(0);
  });

  it("still drafts, and flags it, when no library photo suits the weather", async () => {
    const { p, log } = ports({ candidates: vi.fn(async () => []) });
    const r = await runWeatherPostForCompany(company, p, NOW, fixed);
    expect(r).toMatchObject({ status: "drafted", photos: 0 });
    expect((log.drafts[0] as { sourceMeta: { warnings: string[] } }).sourceMeta.warnings.join(" ")).toMatch(/No photo in the library suited/);
  });

  it("records a failure when the writer fails", async () => {
    const { p } = ports({ write: vi.fn(async () => { throw new Error("The writer returned nothing usable"); }) });
    expect(await runWeatherPostForCompany(company, p, NOW, fixed)).toMatchObject({ status: "failed" });
  });
});
