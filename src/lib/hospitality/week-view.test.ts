import { describe, expect, it } from "vitest";
import { captionFirstLine, cleanDate, groupByDay, moveErrorText, nextDays, timeLabel, weekRangeLabel, weekWindow } from "./week-view";

describe("weekWindow", () => {
  it("runs Monday to Sunday with the weeks either side", () => {
    const w = weekWindow("2026-10-15"); // a Thursday
    expect(w.start).toBe("2026-10-12");
    expect(w.end).toBe("2026-10-18");
    expect(w.dates).toHaveLength(7);
    expect(w.previous).toBe("2026-10-05");
    expect(w.next).toBe("2026-10-19");
  });
  it("treats Sunday as the end of its week", () => {
    expect(weekWindow("2026-10-18").start).toBe("2026-10-12");
  });
});

describe("cleanDate", () => {
  it("accepts real dates only", () => {
    expect(cleanDate("2026-10-14")).toBe("2026-10-14");
    expect(cleanDate("2026-02-30")).toBeNull();
    expect(cleanDate("14/10/2026")).toBeNull();
    expect(cleanDate(undefined)).toBeNull();
  });
});

describe("groupByDay", () => {
  const dates = nextDays("2026-10-12", 3);
  it("puts posts on their day, earliest first, and drops the rest", () => {
    const groups = groupByDay(
      [
        { id: "b", scheduled_date: "2026-10-12", scheduled_time: "18:00:00" },
        { id: "a", scheduled_date: "2026-10-12", scheduled_time: "07:00:00" },
        { id: "c", scheduled_date: "2026-10-14", scheduled_time: null },
        { id: "x", scheduled_date: "2026-10-20", scheduled_time: "07:00:00" },
        { id: "y", scheduled_date: null, scheduled_time: null },
      ],
      dates,
      "2026-10-13"
    );
    expect(groups.map((g) => g.posts.map((p) => p.id))).toEqual([["a", "b"], [], ["c"]]);
    expect(groups[1].isToday).toBe(true);
    expect(groups[1].label).toBe("Today, Tuesday 13 October");
    expect(groups[0].label).toBe("Monday 12 October");
  });
});

describe("labels", () => {
  it("names a week range", () => {
    expect(weekRangeLabel("2026-10-12")).toBe("Monday 12 October to Sunday 18 October");
  });
  it("takes the first real line of a caption", () => {
    expect(captionFirstLine("\n## **Sunny** on the terrace\nMore")).toBe("Sunny on the terrace");
    expect(captionFirstLine("a".repeat(100), 20)).toBe(`${"a".repeat(17)}...`);
    expect(captionFirstLine(null)).toBe("");
  });
  it("reads a time", () => {
    expect(timeLabel("07:30:00")).toBe("07:30");
    expect(timeLabel(null)).toBeNull();
  });
  it("explains a failed move in plain words", () => {
    expect(moveErrorText(422, "No content week covers 2026-11-01 yet")).toMatch(/not open for posts/);
    expect(moveErrorText(404, "Piece not found")).toMatch(/could not find/);
    expect(moveErrorText(500, "boom")).toBe("That did not save. Try again in a moment.");
  });
});
