import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const posts = [
  { id: "pending", company_id: "ours", title: "A waiting post", markdown_body: "A useful customer conversation", approval_status: "pending", created_at: "2026-10-01", post_type: "insight" },
  { id: "approved", company_id: "ours", title: "A finished post", markdown_body: "Ready to share", approval_status: "approved", created_at: "2026-10-02", post_type: "insight" },
  { id: "tray", company_id: "ours", week_id: "tray-week", title: "A standalone draft", markdown_body: "A unique unscheduled conversation", approval_status: "pending", created_at: "2026-10-03", post_type: "insight" },
  { id: "batched", company_id: "ours", week_id: "real-week", title: "A batched post", markdown_body: "Batched conversation", approval_status: "pending", created_at: "2026-10-03" },
  { id: "foreign-tray", company_id: "other", week_id: "foreign-week", title: "Foreign standalone draft", approval_status: "pending", created_at: "2026-10-03" },
  { id: "foreign", company_id: "other", title: "Another company's post", approval_status: "pending", created_at: "2026-10-02" },
];

const weeks = [
  { id: "tray-week", company_id: "ours", week_number: 0, title: "Standalone content", date_start: "2025-01-01", status: "draft" },
  { id: "real-week", company_id: "ours", week_number: 42, title: "A genuine week", date_start: "2026-10-12", status: "draft" },
  { id: "foreign-week", company_id: "other", week_number: 0, title: "Foreign storage", date_start: "2025-01-01", status: "draft" },
];

function builder(table: string) {
  let columns = "";
  let companyId: unknown;
  let statuses: unknown[] = [];
  let individualFilter: string | null = null;
  const b = {
    select: (value: string) => { columns = value; return b; },
    eq: (key: string, value: unknown) => { if (key === "company_id") companyId = value; return b; },
    in: (_key: string, values: unknown[]) => { statuses = values; return b; },
    is: () => { individualFilter = "week_id.is.null"; return b; },
    or: (value: string) => { individualFilter = value; return b; },
    order: () => b,
    limit: () => b,
    then: (resolve: (value: unknown) => unknown) => {
      let data: unknown[] = [];
      if (table === "weeks") data = weeks.filter(w => !companyId || w.company_id === companyId);
      if (table === "content_pieces") data = posts.filter(p => p.company_id === companyId && (!individualFilter || (
        statuses.includes(p.approval_status) && (!p.week_id || individualFilter.includes(p.week_id))
      )));
      if (columns === "approval_status") data = data.map(p => ({ approval_status: (p as typeof posts[number]).approval_status }));
      return Promise.resolve({ data, count: 0 }).then(resolve);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => ({ id: "user", role: "client", company_id: "ours", company: { post_pack: "b2b" } }),
  createServerSupabaseClient: async () => ({ from: builder }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("@/components/review/ReviewFilters", () => ({ default: () => null }));

import ReviewPage from "./page";
const render = async (params: { status?: string; q?: string } = {}) => renderToStaticMarkup(await ReviewPage({ searchParams: Promise.resolve(params) }));

describe("review page", () => {
  it("applies the selected status to the displayed posts and retains company scoping", async () => {
    const html = await render({ status: "approved" });
    expect(html).toContain("A finished post");
    expect(html).not.toContain("A waiting post");
    expect(html).not.toContain("Another company");
  });

  it("searches post bodies and tells the user that the individual results are bounded", async () => {
    const html = await render({ q: "CUSTOMER" });
    expect(html).toContain("A waiting post");
    expect(html).not.toContain("A finished post");
    expect(html).toContain("Search covers all weeks and the 20 most recent individual posts for the selected status.");
  });

  it("finds unscheduled tray posts by body without presenting their storage week as a dated batch", async () => {
    const html = await render({ q: "UNSCHEDULED" });
    expect(html).toContain("A standalone draft");
    expect(html).toContain('href="/content/tray"');
    expect(html).toContain("0 weeks and 1 individual post shown");
    expect(html).not.toContain("Standalone content");
    expect(html).not.toContain("Foreign standalone draft");
  });

  it("shows standalone and legacy individual posts once, keeping real batches in the weeks list", async () => {
    const html = await render();
    expect(html).toContain("A standalone draft");
    expect(html).toContain("A waiting post");
    expect(html).toContain("A genuine week");
    expect(html).not.toContain("A batched post");
    expect(html).not.toContain("Standalone content");
    expect(html).not.toContain("Foreign standalone draft");
    expect(html).toContain("1 week and 3 individual posts shown");
  });

  it("keeps approval controls outside the post navigation link", async () => {
    const html = await render({ status: "pending" });
    const link = /<a[^>]+href="\/content\/pending"[\s\S]*?<\/a>/.exec(html)?.[0];
    expect(link).toBeDefined();
    expect(link).not.toContain("<button");
    expect(html).toContain(">Approve</button>");
  });
});
