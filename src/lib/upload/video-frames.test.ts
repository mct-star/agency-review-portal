import { describe, expect, it } from "vitest";
import { frameTimes } from "./video-frames";

describe("frameTimes", () => {
  it("takes the start, the middle and the end", () => {
    const t = frameTimes(60);
    expect(t).toHaveLength(3);
    expect(t[0]).toBeLessThan(1);
    expect(t[1]).toBe(30);
    expect(t[2]).toBeGreaterThan(57);
    expect(t[2]).toBeLessThan(60);
  });
  it("stays inside a very short clip", () => {
    for (const t of frameTimes(1)) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
  it("falls back to a single frame when the length is unknown", () => {
    expect(frameTimes(Infinity)).toEqual([0]);
    expect(frameTimes(0)).toEqual([0]);
  });
});
