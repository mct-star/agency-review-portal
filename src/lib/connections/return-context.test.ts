import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConnectionReturn, connectionReturnHref, rememberConnectionReturn } from "./return-context";

describe("company connection return intent", () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("window", { sessionStorage: { setItem: (key: string, value: string) => stored.set(key, value), getItem: (key: string) => stored.get(key) || null, removeItem: (key: string) => stored.delete(key) } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("restores only this user's company and can be cleared after returning", () => {
    rememberConnectionReturn("user-a", "company-a", "publish");
    expect(connectionReturnHref("user-a", "company-a")).toBe("/publish?companyId=company-a");
    expect(connectionReturnHref("user-b", "company-a")).toBeNull();
    expect(connectionReturnHref("user-a", "company-b")).toBeNull();
    clearConnectionReturn("user-a", "company-a");
    expect(connectionReturnHref("user-a", "company-a")).toBeNull();
  });
  it("returns setup to its fixed start page and ignores arbitrary targets", () => {
    rememberConnectionReturn("user-a", "company-a", "setup");
    expect(connectionReturnHref("user-a", "company-a")).toBe("/setup/company-a/start");
    stored.set([...stored.keys()][0], "https://outside.example");
    expect(connectionReturnHref("user-a", "company-a")).toBeNull();
  });
  it("remains usable when storage is blocked", () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("Blocked"); } });
    expect(() => rememberConnectionReturn("user-a", "company-a", "setup")).not.toThrow();
    expect(connectionReturnHref("user-a", "company-a")).toBeNull();
    expect(() => clearConnectionReturn("user-a", "company-a")).not.toThrow();
  });
});
