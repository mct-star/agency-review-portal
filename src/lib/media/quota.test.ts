import { describe, expect, it } from "vitest";
import { checkQuota, formatBytes, quotaState } from "./quota";
import { storageCapBytes } from "@/lib/utils/plan-limits";

const GB = 1024 ** 3;

describe("plan storage caps", () => {
  it("is 5 GB on starter, 25 GB on pro and 100 GB on agency", () => {
    expect(storageCapBytes("starter")).toBe(5 * GB);
    expect(storageCapBytes("pro")).toBe(25 * GB);
    expect(storageCapBytes("agency")).toBe(100 * GB);
  });
});

describe("checkQuota", () => {
  it("allows an upload that fits", () => {
    expect(checkQuota(4 * GB, 0.5 * GB, "starter")).toEqual({ allowed: true });
  });
  it("allows an upload that lands exactly on the cap", () => {
    expect(checkQuota(4 * GB, 1 * GB, "starter")).toEqual({ allowed: true });
  });
  it("refuses an upload that would go over, and says nothing was deleted", () => {
    const r = checkQuota(4.5 * GB, 1 * GB, "starter");
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.message).toMatch(/Nothing has been deleted/);
      expect(r.message).toMatch(/4\.5 GB of 5\.0 GB/);
    }
  });
  it("applies the pro cap to a pro company", () => {
    expect(checkQuota(20 * GB, 4 * GB, "pro")).toEqual({ allowed: true });
    expect(checkQuota(24 * GB, 2 * GB, "pro").allowed).toBe(false);
  });
});

describe("quotaState and formatBytes", () => {
  it("reports the fraction for the usage bar, capped at 1", () => {
    expect(quotaState(2.5 * GB, "starter").fraction).toBeCloseTo(0.5);
    expect(quotaState(9 * GB, "starter").fraction).toBe(1);
  });
  it("formats sizes plainly", () => {
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(3.2 * GB)).toBe("3.2 GB");
  });
});
