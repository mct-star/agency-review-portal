import { describe, expect, it } from "vitest";
import { addDays, dayNameOf, hhmm, isoWeekOfDate, longDateLabel, mondayOf, todayIn, weekDates } from "./week";

describe("week arithmetic", () => {
  it("finds the Monday of any day, including a Sunday", () => {
    expect(mondayOf("2026-10-14")).toBe("2026-10-12"); // Wednesday
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the week before
  });
  it("numbers ISO weeks, across a year boundary", () => {
    expect(isoWeekOfDate("2026-10-14")).toEqual({ week: 42, year: 2026 });
    expect(isoWeekOfDate("2026-01-01")).toEqual({ week: 1, year: 2026 });
    expect(isoWeekOfDate("2027-01-01")).toEqual({ week: 53, year: 2026 });
  });
  it("adds days over a month end", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
  it("names the day and labels the date", () => {
    expect(dayNameOf("2026-10-14")).toBe("Wednesday");
    expect(longDateLabel("2026-10-14")).toBe("Wednesday 14 October");
  });
  it("lists the seven days of a week, Monday first", () => {
    const d = weekDates("2026-10-14");
    expect(d[0]).toBe("2026-10-12");
    expect(d[6]).toBe("2026-10-18");
  });
  it("gives today's date in a time zone, not the server's", () => {
    // 23:30 UTC on 14 Oct is already 15 Oct in Auckland and still 14 Oct in London (BST).
    const now = new Date("2026-10-14T23:30:00Z");
    expect(todayIn("Europe/London", now)).toBe("2026-10-15");
    expect(todayIn("UTC", now)).toBe("2026-10-14");
    expect(todayIn("Pacific/Auckland", now)).toBe("2026-10-15");
  });
  it("trims a Postgres time to hours and minutes", () => {
    expect(hhmm("07:00:00")).toBe("07:00");
    expect(hhmm("garbage")).toBe("07:00");
  });
});
