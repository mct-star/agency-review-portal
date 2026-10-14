import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WEATHER_CRON_UTC_HOUR, greetingFor, nextWeatherDraft, postsWaitingLine, weatherLine } from "./home";

const base = { weather_post_enabled: true, weather_post_time: "08:00:00", weather_post_for: "today", timezone: "Europe/London", latitude: 51.45, longitude: -2.59 };

describe("the weather job schedule the home page quotes", () => {
  it("matches the cron in vercel.json", () => {
    const vercel = JSON.parse(readFileSync(path.join(__dirname, "../../../vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const job = vercel.crons.find((c) => c.path === "/api/cron/weather-posts");
    expect(job?.schedule).toBe(`0 ${WEATHER_CRON_UTC_HOUR} * * *`);
  });
});

describe("nextWeatherDraft", () => {
  it("is tomorrow's 04:00 UTC when today's run has passed, shown in the venue's own time", () => {
    // 22:00 UTC on 14 Oct 2026 is 23:00 in London (BST). Next run: 15 Oct 04:00 UTC = 05:00 BST.
    const r = nextWeatherDraft(base, new Date("2026-10-14T22:00:00Z"));
    expect(r).toMatchObject({ runTime: "05:00", runDay: "Thursday 15 October", postTime: "08:00", targetDay: "Thursday 15 October" });
  });
  it("is later today when it has not run yet", () => {
    const r = nextWeatherDraft(base, new Date("2026-10-14T02:00:00Z"));
    expect(r).toMatchObject({ runTime: "05:00", runDay: "Wednesday 14 October" });
  });
  it("is 04:00 in winter, when London is on GMT", () => {
    const r = nextWeatherDraft(base, new Date("2026-12-01T12:00:00Z"));
    expect(r).toMatchObject({ runTime: "04:00", runDay: "Wednesday 2 December" });
  });
  it("targets the next day when the post is for tomorrow", () => {
    const r = nextWeatherDraft({ ...base, weather_post_for: "tomorrow" }, new Date("2026-10-14T22:00:00Z"));
    expect(r).toMatchObject({ runDay: "Thursday 15 October", targetDay: "Friday 16 October" });
  });
  it("uses the venue's date, not the server's, in a far time zone", () => {
    // Auckland is UTC+13 in October: 04:00 UTC on 15 Oct is 17:00 on 15 Oct there.
    const r = nextWeatherDraft({ ...base, timezone: "Pacific/Auckland" }, new Date("2026-10-14T22:00:00Z"));
    expect(r).toMatchObject({ runTime: "17:00", runDay: "Thursday 15 October" });
  });
  it("falls back to London for a time zone that does not exist, and to 07:00 for a missing time", () => {
    const r = nextWeatherDraft({ ...base, timezone: "Nowhere/Land", weather_post_time: null }, new Date("2026-10-14T22:00:00Z"));
    expect(r).toMatchObject({ runTime: "05:00", postTime: "07:00" });
  });
  it("is null when the weather post is switched off", () => {
    expect(nextWeatherDraft({ ...base, weather_post_enabled: false }, new Date())).toBeNull();
  });
});

describe("weatherLine", () => {
  const now = new Date("2026-10-14T22:00:00Z");
  it("says when the next one is drafted and for when", () => {
    expect(weatherLine(base, now)).toBe("Next weather post: drafted around 05:00 on Thursday 15 October, for 08:00 that day. It will wait for you to approve it.");
  });
  it("names the day when the post is for tomorrow", () => {
    expect(weatherLine({ ...base, weather_post_for: "tomorrow" }, now)).toBe(
      "Next weather post: drafted around 05:00 on Thursday 15 October, for 08:00 on Friday 16 October. It will wait for you to approve it."
    );
  });
  it("says nothing at all when it is switched off", () => {
    expect(weatherLine({ ...base, weather_post_enabled: false }, now)).toBeNull();
  });
  it("is honest that a venue with no postcode cannot have one drafted", () => {
    expect(weatherLine({ ...base, latitude: null, longitude: null }, now)).toBe(
      "The weather post is on, but it needs your postcode before it can be drafted. Add it under Venue and posting."
    );
  });
  it("never uses a long dash", () => {
    const dash = String.fromCharCode(0x2014);
    for (const s of [weatherLine(base, now), weatherLine({ ...base, latitude: null, longitude: null }, now)]) expect(s).not.toContain(dash);
  });
});

describe("greetingFor", () => {
  it("follows the venue's clock, not the server's", () => {
    // 08:30 UTC is 09:30 in London in October.
    expect(greetingFor("Sam", new Date("2026-10-14T08:30:00Z"), "Europe/London")).toBe("Good morning, Sam.");
    expect(greetingFor("Sam", new Date("2026-10-14T11:30:00Z"), "Europe/London")).toBe("Good afternoon, Sam.");
    // 16:30 UTC is 17:30 in London: evening.
    expect(greetingFor("Sam", new Date("2026-10-14T16:30:00Z"), "Europe/London")).toBe("Good evening, Sam.");
    // 23:30 UTC on the 14th is already 12:30 on the 15th in Auckland.
    expect(greetingFor("Sam", new Date("2026-10-14T23:30:00Z"), "Pacific/Auckland")).toBe("Good afternoon, Sam.");
  });
});

describe("postsWaitingLine", () => {
  it("counts in plain words", () => {
    expect(postsWaitingLine(0, 0)).toBe("Nothing is waiting. You are up to date.");
    expect(postsWaitingLine(1, 0)).toBe("1 post is waiting for you to approve.");
    expect(postsWaitingLine(4, 0)).toBe("4 posts are waiting for you to approve.");
    expect(postsWaitingLine(4, 1)).toBe("4 posts are waiting for you to approve, and 1 photo from your team to look at.");
    expect(postsWaitingLine(0, 3)).toBe("3 photos from your team are waiting for you to look at.");
  });
});
