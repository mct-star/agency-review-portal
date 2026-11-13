import { describe, expect, it } from "vitest";
import { capturePrompts } from "./prompts";

describe("capturePrompts", () => {
  it("gives a casual piece the evening before and the morning of", () => {
    expect(capturePrompts("casual", "2026-11-18")).toEqual([
      { key: "evening_before", date: "2026-11-17", part: "evening", daysBefore: 1 },
      { key: "morning_of", date: "2026-11-18", part: "morning", daysBefore: 0 },
    ]);
  });

  it("gives a shoot seven days and two days before, never the same day", () => {
    const prompts = capturePrompts("shoot", "2026-11-18");
    expect(prompts).toEqual([
      { key: "seven_days", date: "2026-11-11", part: "day", daysBefore: 7 },
      { key: "two_days", date: "2026-11-16", part: "day", daysBefore: 2 },
    ]);
    expect(prompts.some((p) => p.date === "2026-11-18")).toBe(false);
  });

  it("gives nothing when no recording is needed", () => {
    expect(capturePrompts("none", "2026-11-18")).toEqual([]);
  });

  it("crosses month and year ends correctly", () => {
    expect(capturePrompts("casual", "2027-01-01")[0].date).toBe("2026-12-31");
    expect(capturePrompts("shoot", "2026-12-03")[0].date).toBe("2026-11-26");
  });

  it("accepts a timestamp and uses its calendar date", () => {
    expect(capturePrompts("casual", "2026-11-18T09:30:00.000Z")[1].date).toBe("2026-11-18");
  });

  it("gives nothing for a missing or unreadable date or an unknown kind", () => {
    expect(capturePrompts("casual", null)).toEqual([]);
    expect(capturePrompts("casual", "soon")).toEqual([]);
    expect(capturePrompts("casual", "2026-02-31")).toEqual([]);
    expect(capturePrompts("weird" as never, "2026-11-18")).toEqual([]);
  });
});
