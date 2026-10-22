import { describe, expect, it } from "vitest";
import { calendarQuickCreateHref, plannedDraftLabel, readDraftPlan } from "./quick-create";

describe("Calendar's draft handoff", () => {
  it("carries the selected company, absolute date, slot time and post type", () => {
    const url = new URL(calendarQuickCreateHref("company-b", "2027-01-01", "16:45:00", "poll_question"), "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ company: "company-b", date: "2027-01-01", time: "16:45:00", postType: "poll_question" });
    expect(readDraftPlan(url.searchParams.get("date"), url.searchParams.get("time"))).toEqual({ date: "2027-01-01", time: "16:45", error: null });
  });

  it("validates real dates and clock times without converting the editorial slot into UTC", () => {
    expect(readDraftPlan("2028-02-29", "23:15")).toEqual({ date: "2028-02-29", time: "23:15", error: null });
    for (const [date, time] of [["2027-02-29", "09:00"], ["2027-01-01", "24:00"], [null, "09:00"]]) {
      expect(readDraftPlan(date, time).error).toBeTruthy();
    }
    expect(readDraftPlan(null, null)).toEqual({ date: null, time: null, error: null });
  });

  it("makes the retained date visible as a pending draft rather than a publishing schedule", () => {
    expect(plannedDraftLabel(readDraftPlan("2027-01-01", "16:45"))).toBe("Planned draft for Friday, 1 January 2027 at 16:45. It will stay pending until you review it. Publishing is a separate step.");
  });
});
