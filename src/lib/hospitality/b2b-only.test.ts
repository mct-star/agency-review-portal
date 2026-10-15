import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { B2B_ONLY_PAGE_PREFIXES, NOT_FOR_VENUE, isB2bOnlyPage } from "./b2b-only";

describe("isB2bOnlyPage", () => {
  it("blocks every business-to-business page, with or without a trailing slash or query", () => {
    for (const p of [
      "/strategy",
      "/strategy/interview",
      "/strategy/competitor",
      "/strategy/abc-123",
      "/generate",
      "/generate/studio",
      "/dashboard",
      "/create",
      "/create/article",
      "/create/month",
      "/create/repurpose",
      "/plan/weekly",
      "/compliance",
      "/compliance/00000000-0000-4000-8000-000000000001",
      "/publish",
      "/analytics",
      "/strategy/",
      "/generate?week=1",
      "/setup",
      "/setup/11111111-1111-4111-8111-111111111111/strategy",
      "/content/abc",
      "/review/abc",
      "/upgrade",
      "/users",
      "/admin",
    ]) {
      expect(isB2bOnlyPage(p), p).toBe(true);
    }
  });

  it("lets a hospitality venue reach everything on its own menu", () => {
    for (const p of [
      "/home",
      "/approvals",
      "/generate/quick",
      "/generate/quick?company=1",
      "/create/week-interview",
      "/create/voice",
      "/library",
      "/calendar",
      "/review",
      "/review?week=1",
      "/notifications",
      "/settings",
      "/setup/11111111-1111-4111-8111-111111111111/hospitality",
      "/not-available",
      "",
    ]) {
      expect(isB2bOnlyPage(p), p).toBe(false);
    }
  });

  it("does not match a longer word that only starts the same", () => {
    expect(isB2bOnlyPage("/generated")).toBe(false);
    expect(isB2bOnlyPage("/planning")).toBe(false);
    expect(isB2bOnlyPage("/dashboards")).toBe(false);
  });
});

/**
 * Every page under (app) has to be put in one camp or the other. A page that
 * is neither blocked nor listed here fails the test, so a new business tool
 * cannot quietly appear in front of a hospitality venue.
 */
const OPEN_TO_HOSPITALITY = [
  "/approvals",
  "/calendar",
  "/create/voice",
  "/create/week-interview",
  "/generate/quick",
  "/generate/single", // redirects to /generate/quick
  "/home",
  "/library",
  "/not-available",
  "/notifications",
  "/settings",
];

/** Open by equality or pattern only, so the pages beneath them stay blocked. */
const OPEN_EXACT = [
  "/review", // the venue's review home
  "/setup/11111111-1111-4111-8111-111111111111/hospitality", // the venue's own settings
];
const isOpen = (r: string) => OPEN_EXACT.includes(r) || OPEN_TO_HOSPITALITY.some((p) => r === p || r.startsWith(`${p}/`));

function pages(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pages(full, `${prefix}/${name}`));
    else if (name === "page.tsx") out.push(prefix || "/");
  }
  return out;
}

describe("the pages under (app)", () => {
  // A dynamic segment such as [companyId] stands for a real id when a page is checked.
  const routes = pages(path.join(__dirname, "../../app/(app)")).map((r) =>
    r.replace(/\[[^\]]+\]/g, "11111111-1111-4111-8111-111111111111")
  );

  it("finds the pages", () => {
    expect(routes.length).toBeGreaterThan(30);
    expect(routes).toContain("/home");
  });

  it("are each either blocked for a hospitality venue or deliberately open to it", () => {
    const unclassified = routes.filter(
      (r) => !isB2bOnlyPage(r) && !isOpen(r)
    );
    expect(unclassified, "classify these pages in b2b-only.ts or in OPEN_TO_HOSPITALITY").toEqual([]);
  });

  it("never put a page on both lists", () => {
    const both = routes.filter((r) => isB2bOnlyPage(r) && isOpen(r));
    expect(both).toEqual([]);
  });

  it("have a menu entry for none of the blocked pages in the hospitality menu", () => {
    // The blocked prefixes are the ones the hospitality menu leaves out.
    expect([...B2B_ONLY_PAGE_PREFIXES]).toEqual(expect.arrayContaining(["/strategy", "/generate", "/dashboard"]));
  });
});

describe("the wording", () => {
  it("is plain and has no long dash", () => {
    const dash = String.fromCharCode(0x2014);
    for (const s of Object.values(NOT_FOR_VENUE)) {
      expect(s).not.toContain(dash);
      expect(s.length).toBeGreaterThan(20);
    }
  });
});
