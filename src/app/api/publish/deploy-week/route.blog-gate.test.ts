import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Deploy week with the real website route (15 Nov 2026): a blog that route
 * refuses, for its recorded approval or for an image check the company
 * enforces, is not sent and is left for a person with the route's own
 * sentence as the reason. An in-memory database; GitHub is never reached.
 */
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  tables: {} as Record<string, Row[]>,
  inserts: [] as Array<{ table: string; row: Row }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => state.profile?.role === "admin" ? state.profile : null),
  getSignedInProfile: vi.fn(async () => state.profile),
  requireCompanyUser: vi.fn(async (companyId: string) => state.profile && (state.profile.role === "admin" || state.profile.company_id === companyId) ? state.profile : null),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      const rows = () => (state.tables[table] || []).filter((row) => filters.every((f) => f(row)));
      const chain: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      chain.select = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.not = () => chain;
      chain.eq = (key: string, value: unknown) => { filters.push((r) => r[key] === value); return chain; };
      chain.in = (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return chain; };
      chain.insert = async (row: Row) => { state.inserts.push({ table, row }); return { error: null }; };
      chain.maybeSingle = async () => ({ data: rows()[0] || null, error: null });
      chain.single = chain.maybeSingle;
      chain.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: rows(), error: null }).then(resolve);
      return chain;
    },
  }),
}));

import { POST } from "./route";
import { pieceVersionHash } from "@/lib/content/version-hash";

const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const deploy = () => POST(new Request("http://localhost/api/publish/deploy-week", {
  method: "POST", body: JSON.stringify({ weekId: "week-1", confirm: true, ctaCluster: "launch" }),
}));
const blog: Row = {
  id: "blog", company_id: "company-1", week_id: "week-1", title: "Example blog", content_type: "blog_article",
  approval_status: "approved", markdown_body: "An opening line.\n\nThe end.", first_comment: null,
  day_of_week: null, scheduled_date: future, scheduled_time: "09:00",
};
const approve = () => state.tables.content_approvals.push({
  piece_id: "blog", company_id: "company-1", version_hash: pieceVersionHash(blog as never), decision: "approved", decided_at: "2026-11-14T09:00:00Z",
});

beforeEach(() => {
  state.profile = { id: "admin-1", role: "admin", company_id: null, can_publish: true };
  state.inserts = [];
  delete process.env.PLATFORM_COMPANY_SLUG;
  vi.stubEnv("WEBSITE_GITHUB_TOKEN", "t");
  vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("GitHub must not be reached"); }));
  state.tables = {
    weeks: [{ id: "week-1", company_id: "company-1", week_number: 47, date_start: future, date_end: future }],
    companies: [{ id: "company-1", slug: "agency-bristol", post_pack: "b2b" }],
    content_pieces: [{ ...blog }],
    content_assets: [],
    content_images: [{ id: "hero", content_piece_id: "blog", archetype: "hero_image_prompt", public_url: "https://example.com/h.png", sort_order: 0 }],
    company_social_accounts: [],
    company_api_configs: [],
    publishing_jobs: [],
    content_approvals: [],
  };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const websiteJobs = () => state.inserts.filter((i) => i.table === "publishing_jobs" && i.row.target_platform === "website");

describe("POST /api/publish/deploy-week: a blog the website route refuses", () => {
  it("leaves a blog with no recorded approval for a person, with the route's sentence", async () => {
    const body = await (await deploy()).json();
    expect(body.blogs[0]).toMatchObject({
      id: "blog", status: "manual",
      reason: 'The blog "Example blog" has no recorded approval. Approve it again before publishing.',
    });
    expect(websiteJobs()).toEqual([]);
  });

  it("leaves a blog failing an enforced image check for a person, with the route's sentences", async () => {
    approve();
    state.tables.company_api_configs.push({
      company_id: "company-1", service_category: "blog_publishing", provider: "blog_gate", is_active: true,
      provider_settings: { enforceImageChecks: true },
    });
    const body = await (await deploy()).json();
    expect(body.blogs[0]).toMatchObject({ id: "blog", status: "manual" });
    expect(body.blogs[0].reason).toBe([
      'Blog "Example blog": the hero image has no image record. Add what it shows and the passage it serves.',
      'Blog "Example blog": there is no share image. Add a designed 1200 by 630 share card.',
    ].join(" "));
    expect(websiteJobs()).toEqual([]);
  });
});
