import { describe, it, expect } from "vitest";
import { postDateFor } from "./post-date";

describe("postDateFor", () => {
  it("uses the piece's own scheduled date first", () => {
    expect(postDateFor({ scheduled_date: "2026-09-26", day_of_week: "monday" }, "2026-09-21")).toBe("2026-09-26");
  });
  it("counts day names from the Monday of the week, in any case", () => {
    expect(postDateFor({ day_of_week: "Monday" }, "2026-09-21")).toBe("2026-09-21");
    expect(postDateFor({ day_of_week: "saturday" }, "2026-09-21")).toBe("2026-09-26");
    expect(postDateFor({ day_of_week: "Sunday" }, "2026-09-21")).toBe("2026-09-27");
  });
  it("reads Week Batch day numbers (0 is Sunday) instead of dropping them on the start date", () => {
    expect(postDateFor({ day_of_week: "3" }, "2026-09-21")).toBe("2026-09-23");
    expect(postDateFor({ day_of_week: "0" }, "2026-09-21")).toBe("2026-09-27");
  });
  it("reads older Sunday-to-Saturday weeks from their Sunday", () => {
    expect(postDateFor({ day_of_week: "Sunday" }, "2026-09-20")).toBe("2026-09-20");
    expect(postDateFor({ day_of_week: "Tuesday" }, "2026-09-20")).toBe("2026-09-22");
  });
});
