import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { User } from "@/types/database";
import { DETAIL_PAGES, HOME_HREF, adminSections, clientSections, hospitalitySections, sectionsFor } from "./nav";

const UUID = "11111111-1111-4111-8111-111111111111";
const APP_GROUP = path.join(__dirname);
const APP_ROOT = path.join(__dirname, "..");

const admin = { id: "a", role: "admin", company_id: UUID } as unknown as User;
const client = { id: "c", role: "client", company_id: UUID, can_publish: true } as unknown as User;

/** Every href the three menus can show, with the Week Board pages switched on. */
function menuHrefs(): string[] {
  const sections = [
    ...adminSections(admin, { weekBoard: true }),
    ...clientSections(client),
    ...hospitalitySections(client),
  ];
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  return [...new Set([HOME_HREF, ...hrefs])];
}

/**
 * Resolves a URL path to the page.tsx that serves it, walking folders from
 * `root`. A segment matches a folder of the same name first, then a dynamic
 * `[param]` folder, then a route group `(name)` that contains it. Returns the
 * route pattern in folder names (for example `/setup/[companyId]/hospitality`)
 * or null when no page serves it.
 */
function resolve(root: string, urlPath: string): string | null {
  const segments = urlPath.split("/").filter(Boolean);
  function walk(dir: string, rest: string[], pattern: string[]): string[] | null {
    if (rest.length === 0) {
      if (existsSync(path.join(dir, "page.tsx"))) return pattern;
      for (const g of groups(dir)) {
        const found = walk(path.join(dir, g), rest, pattern);
        if (found) return found;
      }
      return null;
    }
    const [head, ...tail] = rest;
    const entries = dirs(dir);
    if (entries.includes(head)) {
      const found = walk(path.join(dir, head), tail, [...pattern, head]);
      if (found) return found;
    }
    for (const d of entries.filter((e) => e.startsWith("[") && !e.startsWith("[["))) {
      const found = walk(path.join(dir, d), tail, [...pattern, d]);
      if (found) return found;
    }
    for (const g of groups(dir)) {
      const found = walk(path.join(dir, g), rest, pattern);
      if (found) return found;
    }
    return null;
  }
  const found = walk(root, segments, []);
  return found ? `/${found.join("/")}` : null;
}

function dirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory());
}
function groups(dir: string): string[] {
  return dirs(dir).filter((n) => n.startsWith("(") && n.endsWith(")"));
}

/** Every page under (app), as a route pattern in folder names. */
function appPages(dir = APP_GROUP, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...appPages(full, `${prefix}/${name}`));
    else if (name === "page.tsx") out.push(prefix || "/");
  }
  return out;
}

function matchesDetail(route: string): boolean {
  return DETAIL_PAGES.some((p) => {
    if (p.endsWith("/*")) {
      const base = p.slice(0, -2);
      return route === base || route.startsWith(`${base}/`);
    }
    return route === p;
  });
}

function menuTargets(): { href: string; target: string | null }[] {
  return menuHrefs().map((href) => {
    const clean = href.split("#")[0].split("?")[0];
    return { href, target: resolve(APP_GROUP, clean) ?? resolve(APP_ROOT, clean) };
  });
}

describe("the navigation map", () => {
  it("resolves a dynamic segment to its folder", () => {
    expect(resolve(APP_GROUP, `/setup/${UUID}/hospitality`)).toBe("/setup/[companyId]/hospitality");
  });

  it("points every menu href at a real page", () => {
    const missing = menuTargets().filter((t) => t.target === null).map((t) => t.href);
    expect(missing, "menu hrefs with no page.tsx").toEqual([]);
  });

  it("puts every page under (app) in a menu or in DETAIL_PAGES", () => {
    const targets = new Set(menuTargets().map((t) => t.target));
    const orphans = appPages().filter((r) => !targets.has(r) && !matchesDetail(r));
    expect(orphans, "pages in neither a menu nor DETAIL_PAGES").toEqual([]);
  });

  it("lists no detail page that does not exist", () => {
    const pages = appPages();
    const stale = DETAIL_PAGES.filter((p) => !pages.some((r) => (p.endsWith("/*") ? r.startsWith(p.slice(0, -1)) : r === p)));
    expect(stale).toEqual([]);
  });

  it("picks the menu by role and pack", () => {
    expect(sectionsFor(admin, "hospitality", { weekBoard: false })[0].title).toBe("Strategise");
    expect(sectionsFor(client, "hospitality")[0].title).toBe("Today");
    expect(sectionsFor(client, "b2b")[0].title).toBe("Strategise");
  });

  it("keeps the hospitality menu's own entries", () => {
    const hrefs = hospitalitySections(client).flatMap((s) => s.items);
    expect(hrefs.map((i) => i.href)).toContain("/notifications");
    expect(hrefs.map((i) => i.href)).toContain("/coming-up");
    expect(hrefs.map((i) => i.label)).toContain("This week");
    expect(hrefs.map((i) => i.href)).toContain(`/setup/${UUID}/hospitality#brand`);
  });
});
