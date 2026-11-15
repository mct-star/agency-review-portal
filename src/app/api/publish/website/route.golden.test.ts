import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The golden dry run (15 Nov 2026): the whole dry run JSON for today's
 * publisher, with no company_api_configs row. It was committed against the
 * route before the per-company publish target existed and must keep passing,
 * unedited, after it. Do not change the expected object to make a change
 * pass: a change here is a change in what the website receives.
 */
const tables: Record<string, unknown> = {};

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const result = { data: tables[table] ?? null, error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve(result);
      chain.insert = async () => ({ error: null });
      return chain;
    },
  }),
}));

import { POST } from "./route";

const req = (body: unknown) => new Request("http://localhost/api/publish/website", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
  vi.stubEnv("WEBSITE_GITHUB_TOKEN", "t");
  vi.stubEnv("WEBSITE_GITHUB_REPO", "");
  vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "");
  tables.content_pieces = {
    id: "p1", company_id: "c1", content_type: "blog_article", approval_status: "approved", title: "The Quiet Launch",
    markdown_body: "# The Quiet Launch\n\nAn opening line.\n\n[[image: hero]]\n\n## A section\n\nMore {words}.\n\n[[image: 1]]\n\nA second paragraph.\n\n[[image: 2]]\n\nThe end.",
  };
  tables.content_assets = [
    { asset_type: "url_slug", text_content: "the-quiet-launch" },
    { asset_type: "seo_title", text_content: "The Quiet Launch | SEO title" },
    { asset_type: "seo_meta_description", text_content: "Two sentences." },
  ];
  tables.content_images = [
    { public_url: "https://s.supabase.co/h.png", archetype: "hero_image_prompt", sort_order: 0 },
    { public_url: "https://s.supabase.co/c.jpg", archetype: "cover_image_prompt", sort_order: 1 },
    { public_url: "https://s.supabase.co/a1.webp", archetype: "in_article_image_prompt_1", sort_order: 2 },
    { public_url: "https://s.supabase.co/a2.png", archetype: "in_article_image_prompt_2", sort_order: 3 },
  ];
  tables.companies = { spokesperson_name: "Michael Colling-Tuck" };
  tables.publishing_jobs = [];
  tables.company_api_configs = null;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("POST /api/publish/website, golden dry run", () => {
  it("returns exactly this for today's publisher", async () => {
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dryRun: true,
      branch: "blog/the-quiet-launch",
      repo: "mct-star/agency-website",
      files: [
        { path: "src/content/blog/the-quiet-launch.mdx", from: "the approved text" },
        { path: "public/images/blog/the-quiet-launch.png", from: "https://s.supabase.co/h.png" },
        { path: "public/images/blog/the-quiet-launch-og.jpg", from: "https://s.supabase.co/c.jpg" },
        { path: "public/images/blog/the-quiet-launch-1.webp", from: "https://s.supabase.co/a1.webp" },
        { path: "public/images/blog/the-quiet-launch-2.png", from: "https://s.supabase.co/a2.png" },
      ],
      mdx: [
        "---",
        "slug: the-quiet-launch",
        "title: \"The Quiet Launch\"",
        "seoTitle: \"The Quiet Launch | SEO title\"",
        "description: \"Two sentences.\"",
        "date: 2026-11-15",
        "readTime: 1 min read",
        "author: Michael Colling-Tuck",
        "heroImage: /images/blog/the-quiet-launch.png",
        "ogImage: /images/blog/the-quiet-launch-og.jpg",
        "ctaCluster: launch",
        "---",
        "",
        "An opening line.",
        "",
        "## A section",
        "",
        "More \\{words\\}.",
        "",
        "![](/images/blog/the-quiet-launch-1.webp)",
        "",
        "A second paragraph.",
        "",
        "![](/images/blog/the-quiet-launch-2.png)",
        "",
        "The end.",
        "",
      ].join("\n"),
      liveUrl: "https://agencymedicalmarketing.com/blog/the-quiet-launch",
      ready: true,
    });
  });
});
