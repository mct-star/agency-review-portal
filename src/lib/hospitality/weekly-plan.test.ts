import { describe, expect, it } from "vitest";
import { buildPlanPrompt, DEFAULT_TIMES, parsePlan, shortfallNote } from "./weekly-plan";
import { weekDates } from "./week";

const WEEK = weekDates("2026-10-19"); // Mon 19 to Sun 25 October

const plan = (posts: unknown[]) => JSON.stringify({ posts });
const post = (over: Record<string, unknown> = {}) => ({ date: "2026-10-21", postType: "event", brief: "Wine tasting Wednesday 7pm, 35 pounds", place: [], subject: [], ...over });

describe("buildPlanPrompt", () => {
  const { system, user } = buildPlanPrompt({ venueName: "Lakeside", settings: { venue_notes: "A lakeside restaurant." }, weekDates: WEEK, transcript: "Wine tasting Wednesday at 7." });
  it("holds the writer to what was said, and allows fewer than five posts", () => {
    expect(system).toMatch(/Use only what the speaker actually said/);
    expect(system).toMatch(/If they support fewer, return fewer/);
    expect(system).toMatch(/Never invent a special, an event, a price/);
  });
  it("lets an event be announced early and reminded on the day without inventing anything", () => {
    expect(system).toMatch(/once earlier in the week to announce it, and once on the day as a reminder/);
  });
  it("names every day of the week with its date, and carries the notes", () => {
    expect(user).toContain("Monday 2026-10-19");
    expect(user).toContain("Sunday 2026-10-25");
    expect(user).toContain("Wine tasting Wednesday at 7.");
  });
  it("does not plan the weather post, which the daily job makes", () => {
    expect(system).not.toContain("weather_of_the_day");
  });
  it("carries no LinkedIn framing", () => {
    expect((system + user).toLowerCase()).not.toContain("linkedin");
  });
});

describe("parsePlan", () => {
  it("reads a good plan and orders it by date", () => {
    const r = parsePlan(plan([post({ date: "2026-10-23", brief: "Fish and chips deal Friday", postType: "special_of_the_day" }), post({ date: "2026-10-19", postType: "whats_on_this_week", brief: "Wed wine tasting, Fri fish and chips" })]), WEEK);
    expect(r.items.map((i) => i.date)).toEqual(["2026-10-19", "2026-10-23"]);
    expect(r.dropped).toEqual([]);
  });

  it("drops a post outside the week instead of moving it", () => {
    const r = parsePlan(plan([post({ date: "2026-10-30" })]), WEEK);
    expect(r.items).toEqual([]);
    expect(r.dropped[0]).toMatch(/outside the week/);
  });

  it("drops an unknown kind, including the weather post, and an empty brief", () => {
    const r = parsePlan(plan([post({ postType: "weather_of_the_day" }), post({ postType: "mystery" }), post({ brief: "   " })]), WEEK);
    expect(r.items).toEqual([]);
    expect(r.dropped).toHaveLength(3);
  });

  it("allows the same event on two days, but removes an exact repeat", () => {
    const r = parsePlan(plan([post({ date: "2026-10-20" }), post({ date: "2026-10-21" }), post({ date: "2026-10-21" })]), WEEK);
    expect(r.items.map((i) => i.date)).toEqual(["2026-10-20", "2026-10-21"]);
  });

  it("caps the week at seven posts and says so", () => {
    const many = WEEK.map((d, i) => post({ date: d, brief: `Thing ${i}` })).concat(post({ date: WEEK[0], brief: "An eighth thing" }));
    const r = parsePlan(plan(many), WEEK);
    expect(r.items).toHaveLength(7);
    expect(r.dropped.join(" ")).toMatch(/left out to keep the week to 7/);
  });

  it("keeps only photo hints from the library vocabulary", () => {
    const r = parsePlan(plan([post({ place: ["deck", "moon"], subject: ["food", "aliens"] })]), WEEK);
    expect(r.items[0].place).toEqual(["deck"]);
    expect(r.items[0].subject).toEqual(["food"]);
  });

  it("throws on anything that is not the agreed shape", () => {
    expect(() => parsePlan("Here is your plan", WEEK)).toThrow();
    expect(() => parsePlan(JSON.stringify({ items: [] }), WEEK)).toThrow();
  });

  it("accepts a fenced reply", () => {
    expect(parsePlan("```json\n" + plan([post()]) + "\n```", WEEK).items).toHaveLength(1);
  });
});

describe("shortfallNote and times", () => {
  it("says plainly when the dictation did not support a full week", () => {
    expect(shortfallNote(0)).toMatch(/could not find anything/);
    expect(shortfallNote(3)).toMatch(/found 3 things/);
    expect(shortfallNote(1)).toMatch(/found 1 thing to/);
    expect(shortfallNote(5)).toBeNull();
    expect(shortfallNote(7)).toBeNull();
  });
  it("has a time for every plannable kind", () => {
    expect(Object.keys(DEFAULT_TIMES).sort()).toEqual(["event", "live_scene", "special_of_the_day", "whats_on_this_week"]);
  });
});

describe("the Coming up list in the plan", () => {
  it("asks for dated events and launches beyond the week, and never a guessed date", () => {
    const { system } = buildPlanPrompt({ venueName: "Lakeside", settings: {}, weekDates: WEEK, transcript: "x", today: "2026-10-15" });
    expect(system).toContain("upcoming");
    expect(system).toContain("120 days");
    expect(system).toMatch(/Never invent a date/);
    expect(system).toContain("2026-10-15");
  });
  it("reads the upcoming list alongside the posts, checks it and names the undated", () => {
    const text = JSON.stringify({
      posts: [post()],
      upcoming: [
        { kind: "event", title: "Christmas bookings open", startsOn: "2026-11-01" },
        { kind: "event", title: "Bonfire night", startsOn: "2026-02-30" },
        { kind: "launch", title: "Autumn menu", startsOn: "2026-10-20", endsOn: "2026-11-30" },
      ],
      undated: ["New Year's party"],
    });
    const r = parsePlan(text, WEEK, "2026-10-15");
    expect(r.items).toHaveLength(1);
    expect(r.upcoming.map((u) => u.title)).toEqual(["Autumn menu", "Christmas bookings open"]);
    expect(r.upcomingNotes.join(" ")).toMatch(/Bonfire night was left out because it has no clear date/);
    expect(r.upcomingNotes.join(" ")).toMatch(/New Year's party was not added/);
  });
  it("is unchanged for a plan with no upcoming list", () => {
    const r = parsePlan(plan([post()]), WEEK);
    expect(r.upcoming).toEqual([]);
    expect(r.upcomingNotes).toEqual([]);
  });
  it("does not call a dictation empty when it only had dates for later", () => {
    expect(shortfallNote(0, 2)).toBeNull();
  });
});
