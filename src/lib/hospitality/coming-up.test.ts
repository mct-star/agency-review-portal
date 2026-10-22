import { describe, expect, it } from "vitest";
import {
  buildSlotBrief,
  checkCandidate,
  dedupeKey,
  dueSlots,
  nextSlotSentence,
  normaliseTime,
  parseIcs,
  parseUpcomingJson,
  postTypeForItem,
  readyHeadline,
  slotsFor,
  twoDayPhrase,
  validateUpcoming,
  type CalendarItem,
} from "./coming-up";

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  id: "i1",
  company_id: "co1",
  kind: "event",
  title: "Quiz night",
  details: "Teams of up to six, £2 a head",
  starts_on: "2026-10-24", // a Saturday
  ends_on: null,
  start_time: "19:30",
  build_up: { week: true, two_days: true, day_of: true },
  status: "active",
  ...over,
});

const TODAY = "2026-10-15";

describe("slotsFor: events", () => {
  it("gives seven days before, two days before and the day itself", () => {
    expect(slotsFor(item())).toEqual([
      { slot: "week", date: "2026-10-17" },
      { slot: "two_days", date: "2026-10-22" },
      { slot: "day_of", date: "2026-10-24" },
    ]);
  });
  it("leaves out a build-up post that is switched off", () => {
    expect(slotsFor(item({ build_up: { week: false, two_days: true, day_of: false } }))).toEqual([{ slot: "two_days", date: "2026-10-22" }]);
  });
  it("treats a missing switch as on", () => {
    expect(slotsFor(item({ build_up: {} as CalendarItem["build_up"] }))).toHaveLength(3);
  });
  it("gives a cancelled item nothing", () => {
    expect(slotsFor(item({ status: "cancelled" }))).toEqual([]);
  });
});

describe("slotsFor: launches", () => {
  const launch = (over: Partial<CalendarItem> = {}) => item({ kind: "launch", title: "Autumn menu", starts_on: "2026-10-20", start_time: null, ...over });
  it("reveals on the start date and has no still-on without an end", () => {
    expect(slotsFor(launch())).toEqual([{ slot: "reveal", date: "2026-10-20" }]);
  });
  it("has no still-on for a run of three days", () => {
    expect(slotsFor(launch({ ends_on: "2026-10-22" }))).toEqual([{ slot: "reveal", date: "2026-10-20" }]);
  });
  it("has a still-on for a run of exactly four days", () => {
    expect(slotsFor(launch({ ends_on: "2026-10-23" }))).toContainEqual({ slot: "still_on", date: "2026-10-21" });
  });
  it("puts the still-on of a ten-day run on day five", () => {
    expect(slotsFor(launch({ ends_on: "2026-10-29" }))).toEqual([
      { slot: "reveal", date: "2026-10-20" },
      { slot: "still_on", date: "2026-10-24" },
    ]);
  });
  it("ignores the event build-up switches", () => {
    expect(slotsFor(launch({ build_up: { week: false, two_days: false, day_of: false } }))).toHaveLength(1);
  });
});

describe("dueSlots", () => {
  it("finds an event seven days out, two days out and today", () => {
    expect(dueSlots([item()], "2026-10-17")).toMatchObject([{ slot: "week" }]);
    expect(dueSlots([item()], "2026-10-22")).toMatchObject([{ slot: "two_days" }]);
    expect(dueSlots([item()], "2026-10-24")).toMatchObject([{ slot: "day_of" }]);
  });
  it("finds nothing on the days in between", () => {
    for (const d of ["2026-10-16", "2026-10-18", "2026-10-21", "2026-10-23", "2026-10-25"]) expect(dueSlots([item()], d)).toEqual([]);
  });
  it("never fires a cancelled item or a switched-off slot", () => {
    expect(dueSlots([item({ status: "cancelled" })], "2026-10-24")).toEqual([]);
    expect(dueSlots([item({ build_up: { week: true, two_days: true, day_of: false } })], "2026-10-24")).toEqual([]);
  });
  it("puts the nearer event first when two are due the same day", () => {
    const far = item({ id: "far", title: "Wine tasting", starts_on: "2026-10-29" }); // seven days out on the 22nd
    const near = item({ id: "near", title: "Quiz night", starts_on: "2026-10-24" }); // two days out on the 22nd
    const due = dueSlots([far, near], "2026-10-22");
    expect(due.map((d) => d.item.id)).toEqual(["near", "far"]);
  });
  it("puts an event on the day ahead of a launch reveal the same day, and a still-on last", () => {
    const reveal = item({ id: "reveal", kind: "launch", title: "New brunch", starts_on: "2026-10-24", start_time: null });
    const stillOn = item({ id: "still", kind: "launch", title: "Pie week", starts_on: "2026-10-20", ends_on: "2026-10-29", start_time: null });
    const due = dueSlots([stillOn, reveal, item()], "2026-10-24");
    expect(due.map((d) => d.item.id)).toEqual(["i1", "reveal", "still"]);
  });
});

describe("words", () => {
  it("says this weekend for a weekend event and the day otherwise", () => {
    expect(twoDayPhrase("2026-10-24")).toBe("this weekend");
    expect(twoDayPhrase("2026-10-22")).toBe("on Thursday");
  });
  it("names the next post and its date", () => {
    expect(nextSlotSentence(item(), TODAY)).toBe("Save-the-date post drafts on Sat 17 Oct");
    expect(nextSlotSentence(item(), "2026-10-24")).toBe("On-the-day post drafts today");
    expect(nextSlotSentence(item({ status: "cancelled" }), TODAY)).toMatch(/Cancelled/);
    expect(nextSlotSentence(item({ build_up: { week: false, two_days: false, day_of: false } }), TODAY)).toBe("No posts switched on.");
  });
  it("names the item in the notification", () => {
    expect(readyHeadline(item())).toBe("Saturday's Quiz night post is ready to approve");
  });
  it("writes from the owner's words and the slot", () => {
    const brief = buildSlotBrief(item(), "two_days", true);
    expect(brief).toContain("Quiz night");
    expect(brief).toContain("£2 a head");
    expect(brief).toContain("this weekend");
    expect(brief).toMatch(/weather/);
    expect(buildSlotBrief(item(), "day_of")).not.toMatch(/weather/);
  });
  it("writes a launch that names a dish as a special, and anything else as an event", () => {
    expect(postTypeForItem({ kind: "launch", title: "New pie", details: null })).toBe("special_of_the_day");
    expect(postTypeForItem({ kind: "launch", title: "Happy hour", details: "Two for one 5 to 7" })).toBe("event");
    expect(postTypeForItem({ kind: "event", title: "Wine tasting", details: null })).toBe("event");
  });
});

describe("dedupeKey", () => {
  it("matches the same thing said two ways", () => {
    expect(dedupeKey("co", "event", "The Quiz Night!", "2026-10-24")).toBe(dedupeKey("co", "event", "quiz night", "2026-10-24"));
    expect(dedupeKey("co", "event", "Fish & chips", "2026-10-24")).toBe(dedupeKey("co", "event", "fish and chips", "2026-10-24"));
  });
  it("keeps apart different dates, kinds and companies", () => {
    const k = dedupeKey("co", "event", "Quiz night", "2026-10-24");
    expect(dedupeKey("co", "event", "Quiz night", "2026-10-31")).not.toBe(k);
    expect(dedupeKey("co", "launch", "Quiz night", "2026-10-24")).not.toBe(k);
    expect(dedupeKey("other", "event", "Quiz night", "2026-10-24")).not.toBe(k);
  });
});

describe("checkCandidate", () => {
  const ok = { kind: "event", title: "Quiz night", startsOn: "2026-10-24" };
  it("accepts a good item and tidies the time", () => {
    expect(checkCandidate({ ...ok, time: "7.30pm" }, TODAY)).toEqual({ ok: true, item: { kind: "event", title: "Quiz night", details: null, startsOn: "2026-10-24", endsOn: null, time: "19:30" } });
  });
  it("refuses a date that is not real, missing or already past", () => {
    expect(checkCandidate({ ...ok, startsOn: "2026-02-30" }, TODAY)).toMatchObject({ ok: false, reason: expect.stringMatching(/no clear date/) });
    expect(checkCandidate({ ...ok, startsOn: undefined }, TODAY)).toMatchObject({ ok: false });
    expect(checkCandidate({ ...ok, startsOn: "Friday" }, TODAY)).toMatchObject({ ok: false });
    expect(checkCandidate({ ...ok, startsOn: "2026-10-14" }, TODAY)).toMatchObject({ ok: false, reason: expect.stringMatching(/already happened/) });
  });
  it("keeps a launch that started already but is still running", () => {
    expect(checkCandidate({ kind: "launch", title: "Pie week", startsOn: "2026-10-12", endsOn: "2026-10-19" }, TODAY)).toMatchObject({ ok: true });
  });
  it("holds the 120-day window at its edge", () => {
    expect(checkCandidate({ ...ok, startsOn: "2027-02-12" }, TODAY)).toMatchObject({ ok: true }); // 120 days
    expect(checkCandidate({ ...ok, startsOn: "2027-02-13" }, TODAY)).toMatchObject({ ok: false, reason: expect.stringMatching(/120 days/) });
  });
  it("refuses an end before the start, and drops an end on the start day", () => {
    expect(checkCandidate({ ...ok, endsOn: "2026-10-20" }, TODAY)).toMatchObject({ ok: false, reason: expect.stringMatching(/ends before/) });
    expect(checkCandidate({ ...ok, endsOn: "2026-10-24" }, TODAY)).toMatchObject({ ok: true, item: { endsOn: null } });
  });
  it("refuses an unknown kind and a missing name", () => {
    expect(checkCandidate({ ...ok, kind: "party" }, TODAY)).toMatchObject({ ok: false });
    expect(checkCandidate({ ...ok, title: "  " }, TODAY)).toMatchObject({ ok: false });
  });
  it("drops a time that is not clear instead of guessing", () => {
    expect(checkCandidate({ ...ok, time: "evening" }, TODAY)).toMatchObject({ ok: true, item: { time: null } });
  });
});

describe("normaliseTime", () => {
  it("reads the usual ways a time is written", () => {
    expect(normaliseTime("19:00")).toBe("19:00");
    expect(normaliseTime("7pm")).toBe("19:00");
    expect(normaliseTime("12am")).toBe("00:00");
    expect(normaliseTime("12pm")).toBe("12:00");
    expect(normaliseTime("25:00")).toBeNull();
    expect(normaliseTime("soon")).toBeNull();
  });
});

describe("validateUpcoming and parseUpcomingJson", () => {
  it("drops repeats, sorts by date and names the undated", () => {
    const r = validateUpcoming(
      [
        { kind: "event", title: "Wine tasting", startsOn: "2026-11-06" },
        { kind: "event", title: "Quiz Night", startsOn: "2026-10-24" },
        { kind: "event", title: "quiz night", startsOn: "2026-10-24" },
      ],
      TODAY,
      ["Bonfire party"]
    );
    expect(r.items.map((i) => i.title)).toEqual(["Quiz Night", "Wine tasting"]);
    expect(r.notes.join(" ")).toMatch(/Bonfire party was not added to Coming up because no date was given/);
  });
  it("reads a fenced reply and refuses one with no list", () => {
    const text = "```json\n" + JSON.stringify({ upcoming: [{ kind: "launch", title: "Autumn menu", startsOn: "2026-10-20" }], undated: [] }) + "\n```";
    expect(parseUpcomingJson(text, TODAY).items).toHaveLength(1);
    expect(() => parseUpcomingJson("nothing here", TODAY)).toThrow();
    expect(() => parseUpcomingJson(JSON.stringify({ events: [] }), TODAY)).toThrow();
  });
});

describe("parseIcs", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "SUMMARY:Quiz night",
    "DESCRIPTION:Teams of six\\, £2 a head.\\nBook at the bar.",
    "DTSTART;TZID=Europe/London:20261024T193000",
    "DTEND;TZID=Europe/London:20261024T220000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Christmas bookings open",
    "DTSTART;VALUE=DATE:20261101",
    "DTEND;VALUE=DATE:20261102",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Pie wee",
    " k",
    "DTSTART;VALUE=DATE:20261102",
    "DTEND;VALUE=DATE:20261109",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Live music",
    "DTSTART:20261030T190000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads timed, all-day, multi-day and UTC events, with folded lines and escapes", () => {
    const found = parseIcs(ics);
    expect(found).toEqual([
      { kind: "event", title: "Quiz night", details: "Teams of six, £2 a head.\nBook at the bar.", startsOn: "2026-10-24", endsOn: null, time: "19:30" },
      { kind: "event", title: "Christmas bookings open", details: null, startsOn: "2026-11-01", endsOn: null, time: null },
      { kind: "event", title: "Pie week", details: null, startsOn: "2026-11-02", endsOn: "2026-11-08", time: null },
      // 19:00 UTC on 30 October is 19:00 in London (British Summer Time ends on the 25th).
      { kind: "event", title: "Live music", details: null, startsOn: "2026-10-30", endsOn: null, time: "19:00" },
    ]);
  });
  it("turns UTC into the venue's own clock in summer", () => {
    const summer = "BEGIN:VEVENT\nSUMMARY:BBQ\nDTSTART:20260704T170000Z\nEND:VEVENT";
    expect(parseIcs(summer)[0]).toMatchObject({ startsOn: "2026-07-04", time: "18:00" });
  });
  it("passes its events through the same checks as everything else", () => {
    const r = validateUpcoming(parseIcs(ics), TODAY);
    expect(r.items).toHaveLength(4);
  });
  it("returns nothing for a file with no events", () => {
    expect(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual([]);
  });
});
