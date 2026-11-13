import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";

const LONG_DASH = String.fromCharCode(0x2014);
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const s = vi.hoisted(() => ({ role: "client", canPublish: true, pending: false, slug: "client-co", accounts: 1 }));

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));
vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => ({ role: s.role, can_publish: s.canPublish, company_id: "example-company", company: { post_pack: "b2b" } }),
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      const data = table === "weeks"
        ? { id: "example-week", company_id: "example-company", week_number: 47, date_start: future, date_end: future, company: { id: "example-company", name: "Example Company", slug: s.slug, post_pack: "b2b" } }
        : [
          { id: "post", title: "A post", content_type: "social_post", approval_status: s.pending ? "pending" : "approved", day_of_week: null, scheduled_date: future, scheduled_time: "09:00" },
          { id: "news", title: "The newsletter", content_type: "linkedin_article", approval_status: "approved", day_of_week: null, scheduled_date: null, scheduled_time: null },
        ];
      const q: Record<string, unknown> = {};
      q.select = () => q; q.eq = () => q; q.order = () => q;
      q.single = async () => ({ data });
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data }).then(resolve);
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q; q.eq = () => q;
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: Array.from({ length: s.accounts }, (_, i) => ({ id: `acc-${i}`, account_name: `Profile ${i}` })) }).then(resolve);
      return q;
    },
  }),
}));
vi.mock("@/components/review/DeployWeekPanel", () => ({
  default: (p: { weekId: string; accounts: unknown[]; showCtaPicker: boolean }) => `DEPLOY-PANEL:${p.weekId}:${p.accounts.length}:${p.showCtaPicker}`,
}));

import DeployWeekPage from "./page";
import { DeployChecklist } from "@/components/review/DeployWeekPanel.checklist";
const render = async () => renderToStaticMarkup(await DeployWeekPage({ params: Promise.resolve({ weekId: "example-week" }) }));

describe("deploy week page", () => {
  beforeEach(() => { s.role = "client"; s.canPublish = true; s.pending = false; s.slug = "client-co"; s.accounts = 1; });

  it("shows what will happen and one Deploy week action for a fully approved week", async () => {
    const html = await render();
    expect(html.match(/DEPLOY-PANEL:/g)).toHaveLength(1);
    expect(html).toContain("DEPLOY-PANEL:example-week:1:false");
    expect(html).toContain("A post");
    expect(html).toContain("The newsletter");
    expect(html).not.toContain(LONG_DASH);
  });

  it("offers no deploy action until every piece is approved", async () => {
    s.pending = true;
    const html = await render();
    expect(html).not.toContain("DEPLOY-PANEL");
    expect(html).toContain('href="/review/example-week"');
  });

  it("offers no deploy action to a client without the publish right", async () => {
    s.canPublish = false;
    expect(await render()).not.toContain("DEPLOY-PANEL");
  });

  it("does not offer the blog's service choice when the week has no blog", async () => {
    s.role = "admin"; s.slug = "agency-bristol";
    expect(await render()).toContain("DEPLOY-PANEL:example-week:1:false");
  });
});

describe("the manual checklist after deploying", () => {
  it("lists the three manual steps with their links", () => {
    const html = renderToStaticMarkup(createElement(DeployChecklist, {
      blogs: [{ id: "blog", title: "Blog", status: "pull_request_opened", url: "https://github.com/example/pull/1" }],
      newsletters: [{ id: "news", title: "News", copyHref: "/content/news" }],
      schedulerExportHref: "/api/export/metricool?weekId=example-week",
    }));
    expect(html).toContain("Merge the blog");
    expect(html).toContain('href="https://github.com/example/pull/1"');
    expect(html).toContain("scheduler export");
    expect(html).toContain('href="/api/export/metricool?weekId=example-week"');
    expect(html).toContain("newsletter");
    expect(html).toContain('href="/content/news"');
    expect(html).not.toContain(LONG_DASH);
  });
});
