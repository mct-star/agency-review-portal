import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import ResponsiveSidebar from "./ResponsiveSidebar";
import type { User } from "@/types/database";

const client: User = {
  id: "u1",
  email: "sam@example.test",
  full_name: "Sam Example",
  role: "client",
  company_id: "c1",
  can_publish: false,
  created_at: "2026-10-01T00:00:00Z",
};

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(ResponsiveSidebar, { user: client, postPack: "hospitality", waitingCount: 5, ...props }));

const hrefs = (html: string) => [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))];

describe("phone navigation", () => {
  it("has a top bar for phones only, with the wordmark, a menu button and Help", () => {
    const html = render();
    const bar = /<header[^>]*class="([^"]*)"[\s\S]*?<\/header>/.exec(html);
    expect(bar).not.toBeNull();
    expect(bar![1]).toContain("md:hidden");
    expect(bar![0]).toContain('aria-label="Open menu"');
    expect(bar![0]).toContain('aria-label="Help"');
    expect(bar![0]).toContain(">AGENCY<");
  });

  it("keeps the fixed sidebar for 768 px and up, hidden below it", () => {
    const html = render();
    const asides = [...html.matchAll(/<aside class="([^"]*)"/g)].map((m) => m[1]);
    expect(asides).toHaveLength(2); // the desktop sidebar and the one inside the drawer
    const desktop = asides[0];
    expect(desktop).toMatch(/(^| )hidden( |$)/);
    expect(desktop).toContain("md:flex");
    expect(desktop).toContain("w-56");
    expect(desktop).toContain("h-screen");
  });

  it("has a drawer that is closed to begin with, is a dialog and never shows at desktop width", () => {
    const html = render();
    const drawer = /<div id="phone-menu"([^>]*)>/.exec(html);
    expect(drawer).not.toBeNull();
    expect(drawer![1]).toContain('role="dialog"');
    expect(drawer![1]).toContain('aria-modal="true"');
    expect(drawer![1]).toContain("-translate-x-full");
    expect(drawer![1]).toMatch(/\binert\b/);
    const wrapper = /<div class="([^"]*)"><div class="absolute inset-0[^"]*" aria-hidden="true" data-testid="phone-menu-backdrop"/.exec(html);
    expect(wrapper).not.toBeNull();
    expect(wrapper![1]).toContain("md:hidden");
    expect(wrapper![1]).toContain("invisible");
  });

  it("has a backdrop that closes the drawer and a close button", () => {
    const html = render();
    expect(html).toContain('data-testid="phone-menu-backdrop"');
    expect(html).toContain('aria-label="Close menu"');
  });

  it("shows the waiting count beside Waiting for you when posts are pending, and none when nothing is", () => {
    expect(render({ waitingCount: 5 })).toContain('aria-label="5 waiting"');
    expect(render({ waitingCount: 0 })).not.toMatch(/aria-label="\d+ waiting"/);
  });
});

describe("hospitality menu", () => {
  it("links only to the hospitality routes and to none of the business-to-business ones", () => {
    const links = hrefs(render()).filter((h) => h.startsWith("/"));
    expect(links).toEqual(
      expect.arrayContaining([
        "/home",
        "/approvals",
        "/generate/quick",
        "/create/week-interview",
        "/library",
        "/calendar",
        "/review",
        "/notifications",
        "/setup/c1/hospitality",
        "/setup/c1/hospitality#brand",
      ])
    );
    const b2bOnly = [
      "/strategy",
      "/strategy/competitor",
      "/generate",
      "/dashboard",
      "/compliance",
      "/publish",
      "/analytics",
      "/plan/weekly",
      "/create/voice",
      "/create/article",
      "/create/repurpose",
      "/create/month",
    ];
    for (const route of b2bOnly) expect(links).not.toContain(route);
  });

  it("does not use the business-to-business labels", () => {
    const html = render();
    for (const label of ["Strategy Interview", "Competitor Analysis", "Content Studio", "Week Batch", "Compliance", "Quick Post", "Voice to Post"]) {
      expect(html).not.toContain(label);
    }
  });
});
