import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dates = vi.hoisted(() => ({ start: "2026-10-26", end: "2026-11-01", approved: false, canPublish: false, role: "client" }));

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => ({ role: dates.role, can_publish: dates.canPublish, company_id: "example-company", company: { post_pack: "b2b" } }),
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      const result = {
        data: table === "weeks" ? {
          id: "example-week", week_number: 44, date_start: dates.start, date_end: dates.end,
          status: "pending", pillar: "P1", theme: "A", title: "Example week",
          company: { id: "example-company", name: "Example Company" },
        } : table === "content_pieces" && dates.approved ? [{ id: "approved-piece", content_type: "social_post", approval_status: "approved" }] : [],
      };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        single: async () => result,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  }),
}));
vi.mock("@/components/content/WeekReviewTabs", () => ({ default: () => null }));
vi.mock("@/components/weeks/MetricoolExportButton", () => ({ default: () => null }));

import WeekReviewPage from "./page";
const render = async () => renderToStaticMarkup(await WeekReviewPage({ params: Promise.resolve({ weekId: "example-week" }) }));

describe("week review dates", () => {
  beforeEach(() => { dates.start = "2026-10-26"; dates.end = "2026-11-01"; dates.approved = false; dates.canPublish = false; dates.role = "client"; });

  it("shows a human date range without replacing the stored pillar and theme", async () => {
    const html = await render();
    expect(html).toContain("26 Oct");
    expect(html).toMatch(/26 Oct(?:<!-- -->)? to (?:<!-- -->)?1 Nov 2026/);
    expect(html).not.toContain("2026-10-26");
    expect(html).not.toContain("2026-11-01");
    expect(html).not.toContain("\u2014");
    expect(html).toContain("Pillar: P1");
    expect(html).toContain("Theme: A");
  });

  it("includes the ending year for a week crossing New Year", async () => {
    dates.start = "2026-12-28";
    dates.end = "2027-01-03";
    expect(await render()).toMatch(/28 Dec(?:<!-- -->)? to (?:<!-- -->)?3 Jan 2027/);
  });

  it("carries the approved week's company into publishing instead of restoring another company", async () => {
    dates.approved = true;
    dates.role = "admin";
    const html = await render();
    expect(html).toContain('href="/publish?companyId=example-company"');
    expect(html).not.toContain('href="/publish"');
  });

  it("offers publishing to an authorised company publisher only", async () => {
    dates.approved = true;
    expect(await render()).not.toContain("Publishing options");
    dates.canPublish = true;
    expect(await render()).toContain('href="/publish?companyId=example-company"');
  });
});
