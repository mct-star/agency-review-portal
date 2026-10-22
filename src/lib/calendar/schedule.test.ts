import { describe, it, expect } from "vitest";
import { dateInWeek, dayOfDate, isIsoDate, normDay, weekForDate } from "./schedule";
import { plannedWeekId } from "./schedule";
import { fakeSupabase } from "@/test/fake-supabase";

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

describe("a future recurring slot's week", () => {
  it("reuses an existing company/date week without changing its metadata", async () => {
    const fake = fakeSupabase({ weeks: { data: { id: "existing" } } });
    expect(await plannedWeekId(fake.client as unknown as Parameters<typeof plannedWeekId>[0], "company-b", "2027-01-01")).toBe("existing");
    expect(fake.calls).toContainEqual({ table: "weeks", method: "eq", args: ["company_id", "company-b"] });
    expect(fake.calls.some((call) => call.method === "upsert")).toBe(false);
  });

  it("uses the existing company/week/year unique key without overwriting a concurrent plan", async () => {
    let created = false;
    const fake = fakeSupabase({ weeks: (calls) => {
      if (calls.some((call) => call.method === "upsert")) { created = true; return { data: null }; }
      return { data: created ? { id: "future", date_start: "2026-12-28", date_end: "2027-01-03" } : null };
    } });
    expect(await plannedWeekId(fake.client as unknown as Parameters<typeof plannedWeekId>[0], "company-b", "2027-01-01")).toBe("future");
    expect(fake.calls.find((call) => call.method === "upsert")?.args).toEqual([
      { company_id: "company-b", week_number: 53, year: 2026, date_start: "2026-12-28", date_end: "2027-01-03", title: "Week 53", status: "draft" },
      { onConflict: "company_id,week_number,year", ignoreDuplicates: true },
    ]);
    expect(fake.calls.filter((call) => call.method === "eq" && call.args[0] === "company_id")).toHaveLength(2);
  });
});
