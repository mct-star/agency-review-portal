import { describe, expect, it } from "vitest";
import { defaultPostSlot } from "./slot";

const at = (iso: string) => new Date(iso);

describe("defaultPostSlot", () => {
  it("picks lunchtime in the morning, evening in the afternoon, tomorrow at night", () => {
    expect(defaultPostSlot("Europe/London", at("2026-10-15T08:00:00Z"))).toEqual({ date: "2026-10-15", time: "12:00" });
    expect(defaultPostSlot("Europe/London", at("2026-10-15T14:00:00Z"))).toEqual({ date: "2026-10-15", time: "18:00" });
    expect(defaultPostSlot("Europe/London", at("2026-10-15T20:00:00Z"))).toEqual({ date: "2026-10-16", time: "12:00" });
  });
  it("uses the venue's clock, not UTC", () => {
    // 10:45 UTC in July is 11:45 London, so lunch has passed.
    expect(defaultPostSlot("Europe/London", at("2026-07-15T10:45:00Z"))).toEqual({ date: "2026-07-15", time: "18:00" });
  });
});
