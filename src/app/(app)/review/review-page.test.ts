import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const posts = [
  { id: "pending", company_id: "ours", title: "A waiting post", markdown_body: "A useful customer conversation", approval_status: "pending", created_at: "2026-10-01", post_type: "insight" },
  { id: "approved", company_id: "ours", title: "A finished post", markdown_body: "Ready to share", approval_status: "approved", created_at: "2026-10-02", post_type: "insight" },
  { id: "foreign", company_id: "other", title: "Another company's post", approval_status: "pending", created_at: "2026-10-02" },
];

function builder(table: string) {
  let columns = "";
  let companyId: unknown;
  let statuses: unknown[] = [];
  let individual = false;
  const b = {
    select: (value: string) => { columns = value; return b; },
    eq: (key: string, value: unknown) => { if (key === "company_id") companyId = value; return b; },
    in: (_key: string, values: unknown[]) => { statuses = values; return b; },
    is: () => { individual = true; return b; },
    order: () => b,
    limit: () => b,
    then: (resolve: (value: unknown) => unknown) => {
      let data: unknown[] = [];
      if (table === "content_pieces") data = posts.filter(p => p.company_id === companyId && (!individual || statuses.includes(p.approval_status)));
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

  it("keeps approval controls outside the post navigation link", async () => {
    const html = await render({ status: "pending" });
    const link = /<a[^>]+href="\/content\/pending"[\s\S]*?<\/a>/.exec(html)?.[0];
    expect(link).toBeDefined();
    expect(link).not.toContain("<button");
    expect(html).toContain(">Approve</button>");
  });
});
