import { describe, expect, it } from "vitest";
import { decideRate, LIMITS } from "./rate-limit";
import { hashIp, isPlausibleToken, newStaffToken, staffUploadUrl } from "./token";

describe("staff token", () => {
  it("makes a long unguessable token that passes its own check", () => {
    const t = newStaffToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(isPlausibleToken(t)).toBe(true);
    expect(newStaffToken()).not.toBe(t);
  });
  it("rejects values that cannot be a token", () => {
    expect(isPlausibleToken("short")).toBe(false);
    expect(isPlausibleToken("has spaces and /slashes/ in it......")).toBe(false);
    expect(isPlausibleToken(undefined)).toBe(false);
  });
  it("builds the address staff open", () => {
    expect(staffUploadUrl("https://app.example.com/", "abc")).toBe("https://app.example.com/add-photo/abc");
  });
  it("hashes the first forwarded address and never stores it raw", () => {
    const h = hashIp("203.0.113.9, 10.0.0.1", "salt");
    expect(h).not.toContain("203");
    expect(h).toBe(hashIp("203.0.113.9", "salt"));
    expect(h).not.toBe(hashIp("203.0.113.10", "salt"));
  });
});

describe("decideRate", () => {
  it("allows normal use", () => {
    expect(decideRate({ ipLastTenMinutes: 5, companyLastHour: 20 })).toEqual({ allowed: true });
  });
  it("blocks one address that sends too many", () => {
    expect(decideRate({ ipLastTenMinutes: LIMITS.perIpTenMinutes, companyLastHour: 0 }).allowed).toBe(false);
  });
  it("blocks the whole link at the hourly cap", () => {
    expect(decideRate({ ipLastTenMinutes: 0, companyLastHour: LIMITS.perCompanyHour }).allowed).toBe(false);
  });
  it("fails closed when the count could not be read", () => {
    expect(decideRate({ ipLastTenMinutes: null, companyLastHour: 0 }).allowed).toBe(false);
    expect(decideRate({ ipLastTenMinutes: 0, companyLastHour: null }).allowed).toBe(false);
  });
});
