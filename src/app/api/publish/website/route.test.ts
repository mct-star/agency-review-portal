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
import { pieceVersionHash } from "@/lib/content/version-hash";

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
  // A real send checks the recorded approval: the newest decision approves this exact text.
  tables.content_approvals = [{
    piece_id: "p1", version_hash: pieceVersionHash(tables.content_pieces as never), decision: "approved", decided_at: "2026-11-14T09:00:00Z",
  }];
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

describe("POST /api/publish/website, per-company target", () => {
  const settings = {
    repo: "example-org/example-site", baseBranch: "develop", contentPath: "content/posts", imagePath: "static/img/posts",
    liveBaseUrl: "https://example.com/journal", defaultAuthor: "Example Person",
    ctaClusters: [{ code: "pricing-help", label: "Pricing help" }],
  };
  const ownRow = (over: Record<string, unknown> = {}) => ({
    company_id: "c1", service_category: "blog_publishing", provider: "github_pull_request", is_active: true,
    provider_settings: settings, credentials_encrypted: null, ...over,
  });

  beforeEach(() => { tables.company_api_configs = null; });

  it("uses the company's own repo, branch, paths, live address and services in the dry run", async () => {
    tables.company_api_configs = ownRow();
    tables.companies = { spokesperson_name: null };
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "pricing-help", dryRun: true }))).json();
    expect(out.repo).toBe("example-org/example-site");
    expect(out.files.map((f: { path: string }) => f.path)).toEqual([
      "content/posts/the-quiet-launch.mdx", "static/img/posts/the-quiet-launch.png", "static/img/posts/the-quiet-launch-og.jpg",
    ]);
    expect(out.liveUrl).toBe("https://example.com/journal/the-quiet-launch");
    expect(out.mdx).toContain("heroImage: /static/img/posts/the-quiet-launch.png");
    expect(out.mdx).toContain("author: Example Person");
    expect(out.mdx).toContain("ctaCluster: pricing-help");
    expect(out.ready).toBe(false);
    expect(out.missing).toContain("company's website publishing token");
  });

  it("checks the service against the company's own list", async () => {
    tables.company_api_configs = ownRow();
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }));
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toContain("Choose the service the blog points readers to.");
  });

  it("needs no service when the target has none, and writes no ctaCluster line", async () => {
    tables.company_api_configs = ownRow({ provider_settings: { ...settings, ctaClusters: [] } });
    const res = await POST(req({ pieceId: "p1", dryRun: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).mdx).not.toContain("ctaCluster");
  });

  it("opens the pull request on the company's repo and base branch", async () => {
    tables.company_api_configs = ownRow();
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method || "GET", body: init?.body as string | undefined });
      if (url.includes("/contents/content/posts/the-quiet-launch.mdx?ref=develop")) return new Response("", { status: 404 });
      if (url.endsWith("/git/ref/heads/develop")) return new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 });
      if (url.endsWith("/pulls")) return new Response(JSON.stringify({ html_url: "https://github.com/example-org/example-site/pull/2" }), { status: 201 });
      if (url.startsWith("https://s.supabase.co/")) return new Response(new Uint8Array([1]), { status: 200 });
      return new Response("{}", { status: 201 });
    }));
    vi.stubEnv("ENCRYPTION_KEY", "0".repeat(64));
    const { encryptJson } = await import("@/lib/crypto");
    tables.company_api_configs = ownRow({ credentials_encrypted: encryptJson({ token: "company-token" }) });
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "pricing-help" }))).json();
    expect(out.pullRequest).toBe("https://github.com/example-org/example-site/pull/2");
    expect(calls.every(c => !c.url.startsWith("https://api.github.com") || c.url.startsWith("https://api.github.com/repos/example-org/example-site/"))).toBe(true);
    const pull = calls.find(c => c.url.endsWith("/pulls"));
    expect(JSON.parse(pull!.body!)).toMatchObject({ base: "develop" });
  });

  it("answers 422 with the plain sentence when the company has no target, for dry run and real run", async () => {
    vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "some-other-company");
    for (const dryRun of [true, false]) {
      const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun }));
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe("This company has no website publishing target set up yet.");
    }
  });

  it("answers 422 naming the bad field when the company's row is wrong", async () => {
    tables.company_api_configs = ownRow({ provider_settings: { ...settings, repo: "nonsense" } });
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("repo");
  });
});

/**
 * Website preview (19 Nov 2026): the same pull request opened as a GitHub
 * draft before approval, so Vercel builds the post as the site will show it;
 * the approved send then reuses that branch and marks it ready for review.
 */
describe("POST /api/publish/website, preview", () => {
  const PR = "https://github.com/mct-star/agency-website/pull/9";
  beforeEach(() => { tables.content_syndication_links = []; tables.company_api_configs = null; });
  type Call = { url: string; method: string; body?: Record<string, unknown> };
  function github(opts: { openPr?: Record<string, unknown> | null; branchExists?: boolean; draftUnsupported?: boolean } = {}) {
    vi.stubEnv("WEBSITE_GITHUB_TOKEN", "t");
    const calls: Call[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, method, body });
      if (url.includes("/contents/src/content/blog/the-quiet-launch.mdx?ref=main")) return new Response("", { status: 404 });
      if (url.endsWith("/git/ref/heads/main")) return new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 });
      if (url.includes("/pulls?head=")) return new Response(JSON.stringify(opts.openPr ? [opts.openPr] : []), { status: 200 });
      if (url.endsWith("/git/refs")) return new Response("{}", { status: opts.branchExists ? 422 : 201 });
      if (method === "GET" && url.includes("/contents/") && url.includes("?ref=blog%2Fthe-quiet-launch")) {
        return new Response(JSON.stringify({ sha: "old-sha" }), { status: 200 });
      }
      if (url.endsWith("/pulls") && method === "POST") {
        if (opts.draftUnsupported && body?.draft) return new Response(JSON.stringify({ message: "Draft pull requests are not supported in this repository." }), { status: 422 });
        return new Response(JSON.stringify({ html_url: PR, number: 9, node_id: "PR_9", draft: !!body?.draft }), { status: 201 });
      }
      if (url.endsWith("/graphql")) return new Response(JSON.stringify({ data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } }), { status: 200 });
      if (url.startsWith("https://s.supabase.co/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    return calls;
  }

  it("opens an unapproved blog as a draft pull request and records the link, not a send", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), approval_status: "pending" };
    tables.content_approvals = [];
    const calls = github();
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", preview: true }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ preview: true, pullRequest: PR, draft: true, branch: "blog/the-quiet-launch" });
    const pull = calls.find(c => c.url.endsWith("/pulls") && c.method === "POST");
    expect(pull?.body).toMatchObject({ draft: true, head: "blog/the-quiet-launch", base: "main" });
    expect(String(pull?.body?.title)).toContain("Preview");
    expect(inserts.find(i => i.table === "publishing_jobs")).toBeUndefined();
    expect(inserts.find(i => i.table === "content_syndication_links")?.row).toMatchObject({
      content_piece_id: "p1", platform: "website_preview", external_url: PR, is_canonical: false,
    });
  });

  it("still refuses a preview the site could not build: no hero", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), approval_status: "pending" };
    tables.content_images = [];
    github();
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", preview: true }));
    expect(res.status).toBe(422);
    const problems = (await res.json()).problems as string[];
    expect(problems.some(p => p.includes("hero"))).toBe(true);
    expect(problems).not.toContain("Approve the blog first.");
  });

  it("updates the open preview instead of opening a second pull request", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), approval_status: "pending" };
    tables.content_syndication_links = [{ external_url: PR }];
    const calls = github({ openPr: { html_url: PR, number: 9, node_id: "PR_9", draft: true }, branchExists: true });
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "launch", preview: true }))).json();
    expect(out.pullRequest).toBe(PR);
    expect(calls.some(c => c.url.endsWith("/pulls") && c.method === "POST")).toBe(false);
    const puts = calls.filter(c => c.method === "PUT");
    expect(puts.length).toBe(3);
    expect(puts.every(c => c.body?.sha === "old-sha" && c.body?.branch === "blog/the-quiet-launch")).toBe(true);
    expect(inserts.find(i => i.table === "content_syndication_links")).toBeUndefined();
  });

  it("falls back to an ordinary pull request marked as a preview when the repository has no drafts", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), approval_status: "pending" };
    const calls = github({ draftUnsupported: true });
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "launch", preview: true }))).json();
    expect(out).toMatchObject({ pullRequest: PR, draft: false });
    const pulls = calls.filter(c => c.url.endsWith("/pulls") && c.method === "POST");
    expect(pulls.map(p => !!p.body?.draft)).toEqual([true, false]);
    expect(String(pulls[1].body?.title)).toContain("do not merge");
  });

  it("refuses a preview of a blog already sent", async () => {
    tables.publishing_jobs = [{ external_url: PR, status: "queued" }];
    github();
    expect((await POST(req({ pieceId: "p1", ctaCluster: "launch", preview: true }))).status).toBe(409);
  });

  it("the approved send reuses the preview branch, marks it ready and renames it", async () => {
    const calls = github({ openPr: { html_url: PR, number: 9, node_id: "PR_9", draft: true }, branchExists: true });
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch" }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.pullRequest).toBe(PR);
    expect(calls.some(c => c.url.endsWith("/pulls") && c.method === "POST")).toBe(false);
    const ready = calls.find(c => c.url.endsWith("/graphql"));
    expect(ready?.body).toMatchObject({ variables: { id: "PR_9" } });
    expect(String(ready?.body?.query)).toContain("markPullRequestReadyForReview");
    const rename = calls.find(c => c.url.endsWith("/pulls/9") && c.method === "PATCH");
    expect(rename?.body).toMatchObject({ title: "Blog: The Quiet Launch" });
    expect(inserts.find(i => i.table === "publishing_jobs")?.row).toMatchObject({ external_url: PR, status: "queued" });
  });

  it("the approved send of a ready preview does not ask GitHub to mark it ready again", async () => {
    const calls = github({ openPr: { html_url: PR, number: 9, node_id: "PR_9", draft: false }, branchExists: true });
    expect((await POST(req({ pieceId: "p1", ctaCluster: "launch" }))).status).toBe(200);
    expect(calls.some(c => c.url.endsWith("/graphql"))).toBe(false);
    expect(calls.some(c => c.url.endsWith("/pulls/9") && c.method === "PATCH")).toBe(true);
  });

  it("still needs approval for the real send", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), approval_status: "pending" };
    github();
    expect((await POST(req({ pieceId: "p1", ctaCluster: "launch" }))).status).toBe(422);
  });
});

describe("POST /api/publish/website, captions", () => {
  beforeEach(() => { tables.company_api_configs = null; });
  it("writes an inline image's caption into the post", async () => {
    tables.content_pieces = { ...(tables.content_pieces as object), markdown_body: "# The Quiet Launch\n\nOpening.\n\n[[image: 1]]\n\nEnd." };
    tables.content_images = [
      { id: "h", public_url: "https://s.supabase.co/h.png", archetype: "hero_image_prompt", sort_order: 0 },
      { id: "i1", public_url: "https://s.supabase.co/i1.png", archetype: "in_article_image_prompt_1", sort_order: 1,
        image_record: { role: "inline", type: "diagram", passage: "p", alt: "Four steps", caption: "Fees begin at the fourth step." } },
    ];
    const out = await (await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }))).json();
    expect(out.mdx).toContain('![Four steps](/images/blog/the-quiet-launch-1.png "Fees begin at the fourth step.")');
  });
});
