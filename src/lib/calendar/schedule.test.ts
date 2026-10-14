import { describe, it, expect } from "vitest";
import { dateInWeek, dayOfDate, isIsoDate, normDay, weekForDate } from "./schedule";

describe("schedule", () => {
  it("reads a day in any case and refuses anything else", () => {
    expect(normDay("Sunday")).toBe("sunday");
    expect(normDay("wednesday")).toBe("wednesday");
    expect(normDay("Funday")).toBeNull();
    expect(normDay(null)).toBeNull();
  });

  it("names the weekday of a date", () => {
    expect(dayOfDate("2026-09-27")).toBe("sunday");
    expect(dayOfDate("2026-09-28")).toBe("monday");
  });

  it("puts each weekday on its date in the week", () => {
    expect(dateInWeek("2026-09-28", "monday")).toBe("2026-09-28");
    expect(dateInWeek("2026-09-28", "Sunday")).toBe("2026-10-04");
    // A week recorded from a Thursday still counts from its Monday.
    expect(dateInWeek("2026-10-01", "friday")).toBe("2026-10-02");
    expect(dateInWeek("2026-09-28", null)).toBeNull();
  });

  it("finds the planned week covering a date, never the standalone one", () => {
    const weeks = [
      { id: "s", week_number: 0, date_start: "2026-09-01", date_end: "2026-12-31" },
      { id: "w40", week_number: 40, date_start: "2026-09-28", date_end: "2026-10-04" },
      { id: "w41", week_number: 41, date_start: "2026-10-05", date_end: "2026-10-11" },
    ];
    expect(weekForDate(weeks, "2026-10-04")?.id).toBe("w40");
    expect(weekForDate(weeks, "2026-10-05")?.id).toBe("w41");
    expect(weekForDate(weeks, "2026-12-25")).toBeNull();
  });

  it("checks a date string", () => {
    expect(isIsoDate("2026-10-04")).toBe(true);
    expect(isIsoDate("4 Oct")).toBe(false);
  });
});
