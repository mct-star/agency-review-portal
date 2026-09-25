import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const tables: Record<string, unknown> = {};
const inserts: Array<{ table: string; row: unknown }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const result = { data: tables[table] ?? null, error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve(result);
      chain.insert = async (row: unknown) => { inserts.push({ table, row }); return { error: null }; };
      return chain;
    },
  }),
}));

import { POST } from "./route";

const req = (body: unknown) => new Request("http://localhost/api/publish/website", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  inserts.length = 0;
  tables.content_pieces = { id: "p1", company_id: "c1", content_type: "blog_article", approval_status: "approved", title: "The Quiet Launch", markdown_body: "# The Quiet Launch\n\nAn opening line.\n\n## A section\n\nMore {words}." };
  tables.content_assets = [{ asset_type: "url_slug", text_content: "the-quiet-launch" }, { asset_type: "seo_meta_description", text_content: "Two sentences." }];
  tables.content_images = [
    { public_url: "https://s.supabase.co/h.png", archetype: "hero_image_prompt", sort_order: 0 },
    { public_url: "https://s.supabase.co/c.jpg", archetype: "cover_image_prompt", sort_order: 1 },
  ];
  tables.companies = { spokesperson_name: "Michael Colling-Tuck" };
  tables.publishing_jobs = [];
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("POST /api/publish/website", () => {
  it("previews the exact files and sends nothing", async () => {
    vi.stubEnv("WEBSITE_GITHUB_TOKEN", "t");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }))).json();
    expect(out.files.map((f: { path: string }) => f.path)).toEqual([
      "src/content/blog/the-quiet-launch.mdx", "public/images/blog/the-quiet-launch.png", "public/images/blog/the-quiet-launch-og.jpg",
    ]);
    expect(out.mdx).toContain("heroImage: /images/blog/the-quiet-launch.png");
    expect(out.mdx).toContain("More \\{words\\}.");
    expect(out.liveUrl).toBe("https://agencymedicalmarketing.com/blog/the-quiet-launch");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("refuses an unapproved blog, naming why", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), approval_status: "pending" };
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }));
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toContain("Approve the blog first.");
  });

  it("refuses a blog already sent", async () => {
    tables.publishing_jobs = [{ external_url: "https://github.com/x/pull/1", status: "queued" }];
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch" }));
    expect(res.status).toBe(409);
  });

  it("says the token is missing rather than failing quietly", async () => {
    const preview = await (await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }))).json();
    expect(preview.missing).toContain("WEBSITE_GITHUB_TOKEN");
    expect((await POST(req({ pieceId: "p1", ctaCluster: "launch" }))).status).toBe(503);
  });

  it("opens a pull request on its own branch and records the canonical URL", async () => {
    vi.stubEnv("WEBSITE_GITHUB_TOKEN", "t");
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method || "GET" });
      if (url.includes("/contents/src/content/blog/the-quiet-launch.mdx?ref=main")) return new Response("", { status: 404 });
      if (url.endsWith("/git/ref/heads/main")) return new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 });
      if (url.endsWith("/pulls")) return new Response(JSON.stringify({ html_url: "https://github.com/mct-star/agency-website/pull/9" }), { status: 201 });
      if (url.startsWith("https://s.supabase.co/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response("{}", { status: 201 });
    }));
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "launch" }))).json();
    expect(out.pullRequest).toBe("https://github.com/mct-star/agency-website/pull/9");
    expect(calls.filter(c => c.method === "PUT").map(c => c.url.split("/contents/")[1])).toEqual([
      "public/images/blog/the-quiet-launch.png", "public/images/blog/the-quiet-launch-og.jpg", "src/content/blog/the-quiet-launch.mdx",
    ]);
    expect(calls.some(c => c.url.endsWith("/git/refs") && c.method === "POST")).toBe(true);
    expect(inserts.find(i => i.table === "content_syndication_links")?.row).toMatchObject({ external_url: "https://agencymedicalmarketing.com/blog/the-quiet-launch", is_canonical: true });
  });
});
