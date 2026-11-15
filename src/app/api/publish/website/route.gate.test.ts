import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The publish gate on POST /api/publish/website (15 Nov 2026): the recorded
 * approval for every company, the image checks blocking only for a company
 * that enforces them, every problem in one answer, alt text in the post and
 * the uploaded share card as the share image. An in-memory database that
 * honours eq and in filters; GitHub is a stub.
 */
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  admin: true,
  tables: {} as Record<string, Row[]>,
  /** A read of this table, with these eq filters, answers an error. */
  failRead: null as null | { table: string; eq?: [string, unknown] },
  writes: [] as Array<{ table: string; method: string; row: unknown }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => (state.admin ? { id: "admin-1" } : null)),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      const eqs: Array<[string, unknown]> = [];
      const failing = () => !!state.failRead && state.failRead.table === table
        && (!state.failRead.eq || eqs.some(([k, v]) => k === state.failRead!.eq![0] && v === state.failRead!.eq![1]));
      const rows = () => (state.tables[table] || []).filter(r => filters.every(f => f(r)));
      const answer = () => failing() ? { data: null, error: { message: "read failed" } } : { data: rows(), error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "not"]) chain[m] = () => chain;
      chain.eq = (k: string, v: unknown) => { eqs.push([k, v]); filters.push(r => r[k] === v); return chain; };
      chain.in = (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return chain; };
      chain.maybeSingle = async () => failing() ? answer() : { data: rows()[0] ?? null, error: null };
      chain.then = (resolve: (v: unknown) => void) => Promise.resolve(answer()).then(resolve);
      for (const m of ["insert", "update", "upsert", "delete"]) {
        chain[m] = async (row: unknown) => { state.writes.push({ table, method: m, row }); return { error: null }; };
      }
      return chain;
    },
  }),
}));

import { POST } from "./route";
import { pieceVersionHash } from "@/lib/content/version-hash";

const TITLE = "The Quiet Launch";
const req = (body: unknown) => new Request("http://localhost/api/publish/website", { method: "POST", body: JSON.stringify(body) });
const check = (extra: Row = {}) => POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true, withChecks: true, ...extra }));

const piece = (): Row => state.tables.content_pieces[0];
const approve = (decision = "approved", hashOf: Row = piece(), at = "2026-11-14T09:00:00Z") => {
  state.tables.content_approvals.push({
    piece_id: "p1", company_id: "c1", version_hash: pieceVersionHash(hashOf as never), decision, decided_at: at,
  });
};
const enforce = (extra: Row = {}) => {
  state.tables.company_api_configs.push({
    company_id: "c1", service_category: "blog_publishing", provider: "blog_gate", is_active: true,
    provider_settings: { enforceImageChecks: true, ...extra },
  });
};
const image = (id: string, archetype: string, url: string | null, extra: Row = {}): Row => ({
  id, content_piece_id: "p1", archetype, public_url: url, sort_order: 0, ...extra,
});
const images = (...rows: Row[]) => { state.tables.content_images = rows; };

/** Nothing may leave the building unless a test opens GitHub on purpose. */
let blockedFetch = vi.fn();
/** A refusal sent nothing: no network call, no job, no syndication link. */
const nothingLeft = () => {
  expect(blockedFetch).not.toHaveBeenCalled();
  expect(state.writes.filter(w => w.table === "publishing_jobs" || w.table === "content_syndication_links")).toEqual([]);
};
/** A GitHub that accepts the pull request, for tests that expect a real send. */
const github = () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || "GET", body: init?.body as string | undefined });
    if (url.includes("/contents/src/content/blog/the-quiet-launch.mdx?ref=main")) return new Response("", { status: 404 });
    if (url.endsWith("/git/ref/heads/main")) return new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 });
    if (url.endsWith("/pulls")) return new Response(JSON.stringify({ html_url: "https://github.com/example/site/pull/3" }), { status: 201 });
    if (url.startsWith("https://s.supabase.co/")) return new Response(new Uint8Array([1]), { status: 200 });
    return new Response("{}", { status: 201 });
  }));
  return calls;
};

const HERO = image("hero", "hero_image_prompt", "https://s.supabase.co/h.png", {
  image_record: { role: "hero", type: "diagram", passage: "The launch plan" },
});
const COVER = image("cover", "cover_image_prompt", "https://s.supabase.co/c.jpg", { sort_order: 1 });
const INLINE = image("inline-1", "in_article_image_prompt_1", "https://s.supabase.co/a1.webp", {
  sort_order: 2, image_record: { role: "inline", type: "diagram", passage: "The timing", alt: "A chart of launch timing" },
});
const SHARE = image("share", "share_card", "https://s.supabase.co/s.png", {
  sort_order: 3, dimensions: "1200x630", created_at: "2026-11-14T08:00:00Z",
  image_record: { role: "share", passage: "The share card" },
});

beforeEach(() => {
  state.admin = true;
  state.failRead = null;
  state.writes = [];
  vi.stubEnv("WEBSITE_GITHUB_TOKEN", "t");
  vi.stubEnv("WEBSITE_GITHUB_REPO", "");
  vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "");
  blockedFetch = vi.fn(async () => { throw new Error("nothing may leave the building in this test"); });
  vi.stubGlobal("fetch", blockedFetch);
  state.tables = {
    content_pieces: [{
      id: "p1", company_id: "c1", content_type: "blog_article", approval_status: "approved", title: TITLE, first_comment: null,
      markdown_body: "An opening line.\n\n[[image: 1]]\n\nThe end.",
    }],
    content_assets: [{ content_piece_id: "p1", asset_type: "url_slug", text_content: "the-quiet-launch" }],
    content_images: [HERO, COVER, INLINE, SHARE],
    companies: [{ id: "c1", spokesperson_name: "Example Person" }],
    publishing_jobs: [],
    company_api_configs: [],
    content_approvals: [],
  };
  approve();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const problemsOf = async (res: Response) => {
  expect(res.status).toBe(422);
  nothingLeft();
  return (await res.json()).problems as string[];
};

describe("POST /api/publish/website: recorded approval, for every company", () => {
  it("passes an exact approval", async () => {
    const res = await check();
    expect(res.status).toBe(200);
  });

  it("refuses a blog with no recorded approval, for dry run and real run", async () => {
    state.tables.content_approvals = [];
    for (const extra of [{}, { dryRun: false }]) {
      expect(await problemsOf(await check(extra)))
        .toContain(`The blog "${TITLE}" has no recorded approval. Approve it again before publishing.`);
    }
  });

  it("refuses when the newest decision asked for changes", async () => {
    approve("changes_requested", piece(), "2026-11-14T10:00:00Z");
    for (const extra of [{}, { dryRun: false }]) {
      expect(await problemsOf(await check(extra)))
        .toContain(`The blog "${TITLE}"'s newest decision asked for changes. Approve it before publishing.`);
    }
  });

  it("refuses a blog edited after approval", async () => {
    piece().markdown_body = "An opening line, edited.\n\n[[image: 1]]\n\nThe end.";
    for (const extra of [{}, { dryRun: false }]) {
      expect(await problemsOf(await check(extra)))
        .toContain(`The blog "${TITLE}" was edited after approval. Approve the current version before publishing.`);
    }
  });

  it("refuses when the approval record cannot be read", async () => {
    state.failRead = { table: "content_approvals" };
    for (const extra of [{}, { dryRun: false }]) {
      expect(await problemsOf(await check(extra)))
        .toContain(`The blog "${TITLE}"'s approval record could not be checked, so nothing was sent.`);
    }
  });

  it("does not repeat itself for a blog that is not approved at all", async () => {
    piece().approval_status = "pending";
    expect(await problemsOf(await check())).toEqual(["Approve the blog first."]);
  });

  it("ignores another company's approval of the same piece", async () => {
    state.tables.content_approvals = [{
      piece_id: "p1", company_id: "c2", version_hash: pieceVersionHash(piece() as never), decision: "approved", decided_at: "2026-11-14T11:00:00Z",
    }];
    for (const extra of [{}, { dryRun: false }]) {
      expect(await problemsOf(await check(extra)))
        .toContain(`The blog "${TITLE}" has no recorded approval. Approve it again before publishing.`);
    }
  });

  it("leaves a plain dry run, without withChecks, as the preview it was", async () => {
    state.tables.content_approvals = [];
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch", dryRun: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("imageChecks");
  });
});

describe("POST /api/publish/website: image checks a company does not enforce", () => {
  it("reports failures as warnings and does not block", async () => {
    images({ ...HERO, image_record: null }, COVER, { ...INLINE, image_record: null });
    const res = await check();
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.imageChecks.enforced).toBe(false);
    expect(out.imageChecks.report.problems).toEqual(expect.arrayContaining([
      `Blog "${TITLE}": the hero image has no image record. Add what it shows and the passage it serves.`,
      `Blog "${TITLE}": there is no share image. Add a designed 1200 by 630 share card.`,
    ]));
  });

  it("falls back to the cover picture as the share image when no share card was uploaded", async () => {
    images(HERO, COVER, INLINE);
    const out = await (await check()).json();
    expect(out.files).toContainEqual({ path: "public/images/blog/the-quiet-launch-og.jpg", from: "https://s.supabase.co/c.jpg" });
    expect(out.mdx).toContain("ogImage: /images/blog/the-quiet-launch-og.jpg");
  });

  it("uses the uploaded share card, not the cover picture, when there is one", async () => {
    const out = await (await check()).json();
    expect(out.files).toContainEqual({ path: "public/images/blog/the-quiet-launch-og.png", from: "https://s.supabase.co/s.png" });
    expect(out.files.some((f: { from: string }) => f.from.endsWith("/c.jpg"))).toBe(false);
  });
});

describe("POST /api/publish/website: image checks a company enforces", () => {
  beforeEach(() => enforce());

  it("lists every problem in one answer: the checks, the approval and each image check", async () => {
    state.tables.content_approvals = [];
    images(
      { ...HERO, image_record: null },
      COVER,
      { ...INLINE, image_record: { role: "inline", type: "diagram", passage: "The timing" } },
      { ...SHARE, dimensions: "1000x600" },
    );
    for (const extra of [{ ctaCluster: "" }, { ctaCluster: "", dryRun: false }]) {
      const res = await check(extra);
      expect(res.status).toBe(422);
      const out = await res.json();
      expect(out.problems).toEqual([
        "Choose the service the blog points readers to.",
        `The blog "${TITLE}" has no recorded approval. Approve it again before publishing.`,
        `Blog "${TITLE}": the hero image has no image record. Add what it shows and the passage it serves.`,
        `Blog "${TITLE}": inline image 1 has no alt text. Describe what it shows in one line.`,
        `Blog "${TITLE}": the share image is 1000 by 600. Replace it with a 1200 by 630 card.`,
      ]);
      expect(out.error).toBe(out.problems.join(" "));
      expect(out.imageChecks.enforced).toBe(true);
      nothingLeft();
    }
  });

  it("blocks a long blog with no inline image and no share card, and does not fall back to the cover", async () => {
    piece().markdown_body = Array.from({ length: 950 }, (_, i) => `word${i}`).join(" ");
    state.tables.content_approvals = [];
    approve();
    images(HERO, COVER);
    expect(await problemsOf(await check())).toEqual([
      `Blog "${TITLE}": the blog is 950 words, over 900, and has no inline image. Add at least one inline image.`,
      `Blog "${TITLE}": there is no share image. Add a designed 1200 by 630 share card.`,
    ]);
  });

  it("refuses a share card that is the same file as the hero, on dry run and real send", async () => {
    images(HERO, INLINE, { ...SHARE, public_url: HERO.public_url });
    for (const extra of [{}, { dryRun: false }]) {
      expect(await problemsOf(await check(extra))).toEqual([
        `Blog "${TITLE}": the share image is the same file as the hero image. Make the share card its own designed image.`,
      ]);
    }
  });

  it("sends when everything is right: the share card as the share image and the alt text in the post", async () => {
    const calls = github();
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch" }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.pullRequest).toBe("https://github.com/example/site/pull/3");
    expect(out.imageChecks).toMatchObject({ enforced: true, report: { problems: [] } });
    const puts = calls.filter(c => c.method === "PUT");
    expect(puts.map(c => c.url.split("/contents/")[1])).toEqual([
      "public/images/blog/the-quiet-launch.png", "public/images/blog/the-quiet-launch-og.png",
      "public/images/blog/the-quiet-launch-1.webp", "src/content/blog/the-quiet-launch.mdx",
    ]);
    expect(calls.some(c => c.url === "https://s.supabase.co/s.png")).toBe(true);
    expect(calls.some(c => c.url === "https://s.supabase.co/c.jpg")).toBe(false);
    const mdx = Buffer.from(JSON.parse(puts[3].body!).content, "base64").toString("utf8");
    expect(mdx).toContain("![A chart of launch timing](/images/blog/the-quiet-launch-1.webp)");
    expect(mdx).toContain("ogImage: /images/blog/the-quiet-launch-og.png");
  });

  it("never writes to content_images", async () => {
    await check();
    await check({ dryRun: false, ctaCluster: "" });
    expect(state.writes.filter(w => w.table === "content_images")).toEqual([]);
    nothingLeft();
  });
});

describe("POST /api/publish/website: inline images", () => {
  it("does not upload an inline image the body has no [[image: n]] line for", async () => {
    images(HERO, INLINE, image("inline-2", "in_article_image_prompt_2", "https://s.supabase.co/a2.png", { sort_order: 4 }), SHARE);
    const calls = github();
    const res = await POST(req({ pieceId: "p1", ctaCluster: "launch" }));
    expect(res.status).toBe(200);
    const puts = calls.filter(c => c.method === "PUT").map(c => c.url.split("/contents/")[1]);
    expect(puts).toContain("public/images/blog/the-quiet-launch-1.webp");
    expect(puts.some(p => p.includes("the-quiet-launch-2"))).toBe(false);
    expect(calls.some(c => c.url === "https://s.supabase.co/a2.png")).toBe(false);
  });
});

describe("POST /api/publish/website: settings and callers", () => {
  it("refuses when the company's blog checks cannot be read", async () => {
    state.failRead = { table: "company_api_configs", eq: ["provider", "blog_gate"] };
    for (const extra of [{}, { dryRun: false }, { withChecks: false }]) {
      const res = await check(extra);
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe("This company's blog checks could not be read, so nothing was sent. Try again.");
      nothingLeft();
    }
  });

  it("refuses when enforceImageChecks is set up wrongly, rather than treating it as not enforcing", async () => {
    enforce({ enforceImageChecks: "true" });
    for (const extra of [{}, { dryRun: false }, { withChecks: false }]) {
      const res = await check(extra);
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe("This company's blog checks are set up wrongly: enforceImageChecks must be true or false.");
      nothingLeft();
    }
  });

  it("is still admin only", async () => {
    state.admin = false;
    for (const extra of [{}, { dryRun: false }]) expect((await check(extra)).status).toBe(401);
    nothingLeft();
  });
});
