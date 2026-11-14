import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deploy week runs the real direct LinkedIn queue route against an
 * in-memory database (no network), so these tests prove the shared queue,
 * its deterministic job id and its unique-key refusal. The website route is
 * replaced by a spy: it would talk to GitHub.
 */
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  tables: {} as Record<string, Row[]>,
  inserts: [] as Array<{ table: string; row: Row }>,
  websiteCalls: [] as Row[],
  failPiece: null as string | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => state.profile?.role === "admin" ? state.profile : null),
  getSignedInProfile: vi.fn(async () => state.profile),
  requireCompanyUser: vi.fn(async (companyId: string) => state.profile && (state.profile.role === "admin" || state.profile.company_id === companyId) ? state.profile : null),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      let inserted: Row | null = null;
      let insertError: { code: string } | null = null;
      const rows = () => (state.tables[table] || []).filter((row) => filters.every((f) => f(row)));
      const chain: Record<string, any> = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.not = (key: string, _op: string, value: unknown) => { filters.push((r) => r[key] !== value); return chain; };
      chain.eq = (key: string, value: unknown) => { filters.push((r) => r[key] === value); return chain; };
      chain.in = (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return chain; };
      chain.insert = (row: Row) => {
        inserted = row;
        if (row.id && (state.tables[table] || []).some((r) => r.id === row.id)) insertError = { code: "23505" };
        else { state.inserts.push({ table, row }); state.tables[table] = [...(state.tables[table] || []), row]; }
        return chain;
      };
      chain.maybeSingle = async () => ({ data: inserted ? (insertError ? null : inserted) : rows()[0] || null, error: insertError });
      chain.single = chain.maybeSingle;
      chain.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: rows(), error: null }).then(resolve);
      return chain;
    },
  }),
}));
// A piece named in failPiece carries a document, which the queue refuses:
// a failure part way through a deploy.
vi.mock("@/lib/content/piece-media", () => ({
  resolvePieceMedia: (piece: { id: string }) => piece.id === state.failPiece ? { shape: "document", items: [] } : { shape: "none", items: [] },
}));
vi.mock("@/app/api/publish/website/route", () => ({
  POST: vi.fn(async (request: Request) => {
    const body = await request.json();
    state.websiteCalls.push(body);
    state.tables.publishing_jobs.push({ id: `web-${body.pieceId}`, company_id: "company-1", content_piece_id: body.pieceId, target_platform: "website", status: "queued", external_url: "https://github.com/example/pull/1" });
    return new Response(JSON.stringify({ pullRequest: "https://github.com/example/pull/1" }), { status: 200 });
  }),
}));

import { POST } from "./route";
import { pieceVersionHash } from "@/lib/content/version-hash";

const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const deploy = (body: Row = {}) => POST(new Request("http://localhost/api/publish/deploy-week", {
  method: "POST", body: JSON.stringify({ weekId: "week-1", confirm: true, ...body }),
}));
const piece = (id: string, extra: Row = {}): Row => ({
  id, company_id: "company-1", week_id: "week-1", title: `Post ${id}`, content_type: "social_post", approval_status: "approved",
  markdown_body: `Approved text ${id}`, first_comment: null, cover_image_url: null,
  day_of_week: null, scheduled_date: future, scheduled_time: "09:00", ...extra,
});
let decisions = 0;
/** Record a decision on the piece's current text, as /api/content/approve does. */
const decide = (id: string, decision = "approved") => {
  const p = state.tables.content_pieces.find((r) => r.id === id)!;
  state.tables.content_approvals.push({
    piece_id: id, company_id: p.company_id, version_hash: pieceVersionHash(p as never), decision,
    decided_at: new Date(Date.UTC(2026, 10, 1) + ++decisions * 1000).toISOString(),
  });
};
const queued = () => state.inserts.filter((i) => i.table === "publishing_jobs" && i.row.target_platform === "linkedin_personal");

beforeEach(() => {
  delete process.env.PLATFORM_COMPANY_SLUG;
  state.profile = { id: "user-1", role: "client", company_id: "company-1", can_publish: true };
  state.inserts = [];
  state.websiteCalls = [];
  state.tables = {
    weeks: [
      { id: "week-1", company_id: "company-1", week_number: 47, date_start: future, date_end: future },
      { id: "week-2", company_id: "company-2", week_number: 47, date_start: future, date_end: future },
    ],
    companies: [
      { id: "company-1", slug: "agency-bristol", post_pack: "b2b" },
      { id: "company-2", slug: "other", post_pack: "b2b" },
    ],
    content_pieces: [piece("a"), piece("b"), piece("x", { company_id: "company-2", week_id: "week-2" })],
    company_social_accounts: [{
      id: "account-1", company_id: "company-1", platform: "linkedin_personal", account_id: "person-1", account_name: "Profile",
      access_token_encrypted: "ciphertext", token_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_active: true,
    }],
    content_images: [], content_assets: [], publishing_jobs: [], content_approvals: [],
  };
  state.failPiece = null;
  for (const id of ["a", "b", "x"]) decide(id);
});

describe("POST /api/publish/deploy-week: deploy", () => {
  it("queues every approved social piece of a fully approved week at its scheduled UK time, through the direct LinkedIn queue", async () => {
    const res = await deploy();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queued.map((q: Row) => q.pieceId).sort()).toEqual(["a", "b"]);
    expect(queued()).toHaveLength(2);
    for (const job of queued()) {
      expect(job.row).toMatchObject({ company_id: "company-1", social_account_id: "account-1", status: "scheduled", triggered_by: "user-1" });
      expect((job.row.publish_payload as Row).provider).toBe("linkedin-direct-v1");
      expect(Date.parse(job.row.scheduled_for as string)).toBeGreaterThan(Date.now());
    }
  });

  it("never queues an unapproved piece: a week with one is refused and nothing is queued", async () => {
    state.tables.content_pieces.push(piece("waiting", { approval_status: "pending" }));
    const res = await deploy();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/approve/i);
    expect(state.inserts).toHaveLength(0);
    expect(state.websiteCalls).toHaveLength(0);
  });

  it("refuses a request without the confirmation, so a link or page load can never deploy", async () => {
    const res = await POST(new Request("http://localhost/api/publish/deploy-week", { method: "POST", body: JSON.stringify({ weekId: "week-1" }) }));
    expect(res.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it("lists a post whose time has passed or that has no time for the scheduler export instead of queueing it", async () => {
    state.tables.content_pieces = [piece("a"), piece("late", { scheduled_date: "2020-01-06" }), piece("untimed", { scheduled_time: null })];
    decide("late"); decide("untimed");
    const body = await (await deploy()).json();
    expect(queued().map((q) => q.row.content_piece_id)).toEqual(["a"]);
    expect(body.notQueued.map((n: Row) => n.pieceId).sort()).toEqual(["late", "untimed"]);
    expect(body.notQueued.every((n: Row) => n.next === "export")).toBe(true);
    expect(body.schedulerExportHref).toBe("/api/export/metricool?weekId=week-1&leftForScheduler=true");
  });

  it("offers the queue only the types it takes, and says truthfully where every other post goes", async () => {
    state.tables.content_pieces = [
      piece("meme", { content_type: "meme" }),
      piece("script", { content_type: "video_script" }),
      piece("late-video", { content_type: "video", scheduled_date: "2020-01-06" }),
    ];
    for (const id of ["meme", "script", "late-video"]) decide(id);
    const body = await (await deploy()).json();
    expect(queued()).toHaveLength(0);
    const next = Object.fromEntries(body.notQueued.map((n: Row) => [n.pieceId, n.next]));
    // The scheduler export carries memes; it carries no video or video script.
    expect(next).toEqual({ meme: "export", script: "by_hand", "late-video": "by_hand" });
  });

  it("asks which account when the company has more than one LinkedIn account, and queues nothing", async () => {
    state.tables.company_social_accounts.push({ ...state.tables.company_social_accounts[0], id: "account-2" });
    const res = await deploy();
    expect(res.status).toBe(409);
    expect(state.inserts).toHaveLength(0);
    expect((await deploy({ socialAccountId: "account-2" })).status).toBe(200);
    expect(queued().every((q) => q.row.social_account_id === "account-2")).toBe(true);
  });
});

describe("POST /api/publish/deploy-week: recorded approval", () => {
  it("does not queue a piece edited after it was approved, and says so", async () => {
    state.tables.content_pieces[0].markdown_body = "Edited after approval";
    const body = await (await deploy()).json();
    expect(queued().map((q) => q.row.content_piece_id)).toEqual(["b"]);
    expect(body.notQueued).toEqual([expect.objectContaining({ pieceId: "a", next: "approve", reason: expect.stringMatching(/edited after approval/i) })]);
  });

  it("does not queue a piece with no recorded approval, and says so", async () => {
    state.tables.content_approvals = state.tables.content_approvals.filter((r) => r.piece_id !== "b");
    const body = await (await deploy()).json();
    expect(queued().map((q) => q.row.content_piece_id)).toEqual(["a"]);
    expect(body.notQueued).toEqual([expect.objectContaining({ pieceId: "b", next: "approve", reason: expect.stringMatching(/no recorded approval/i) })]);
  });

  it("does not queue a piece whose newest decision asked for changes", async () => {
    decide("a", "changes_requested");
    const body = await (await deploy()).json();
    expect(queued().map((q) => q.row.content_piece_id)).toEqual(["b"]);
    expect(body.notQueued[0]).toMatchObject({ pieceId: "a", next: "approve" });
  });

  it("never lists an edited post whose time has passed as in the scheduler export", async () => {
    state.tables.content_pieces[0].scheduled_date = "2020-01-06";
    state.tables.content_pieces[0].markdown_body = "Edited after approval";
    const body = await (await deploy()).json();
    expect(body.notQueued.find((n: Row) => n.pieceId === "a")).toMatchObject({ next: "approve" });
  });
});

describe("POST /api/publish/deploy-week: rights", () => {
  it("requires the publish right for a client", async () => {
    state.profile = { id: "user-1", role: "client", company_id: "company-1", can_publish: false };
    expect((await deploy()).status).toBe(403);
    expect(state.inserts).toHaveLength(0);
  });

  it("lets an admin deploy", async () => {
    state.profile = { id: "admin-1", role: "admin", company_id: null, can_publish: false };
    expect((await deploy()).status).toBe(200);
    expect(queued()).toHaveLength(2);
  });

  it("refuses a LinkedIn account that belongs to another company, and queues nothing", async () => {
    state.tables.company_social_accounts.push({ ...state.tables.company_social_accounts[0], id: "account-other", company_id: "company-2" });
    const res = await deploy({ socialAccountId: "account-other" });
    expect(res.status).toBe(404);
    expect(state.inserts).toHaveLength(0);
  });

  it("ignores another company's LinkedIn job for the same piece id", async () => {
    state.tables.publishing_jobs.push({ id: "foreign", company_id: "company-2", content_piece_id: "a", target_platform: "linkedin_personal", status: "scheduled" });
    const body = await (await deploy()).json();
    expect(body.queued.map((q: Row) => q.pieceId).sort()).toEqual(["a", "b"]);
  });

  it("refuses another company's week as if it did not exist", async () => {
    expect((await deploy({ weekId: "week-2" })).status).toBe(401);
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a hospitality company, for its own people and for an admin", async () => {
    state.tables.companies[0].post_pack = "hospitality";
    expect((await deploy()).status).toBe(403);
    state.profile = { id: "admin-1", role: "admin", company_id: null, can_publish: true };
    expect((await deploy()).status).toBe(403);
    expect(state.inserts).toHaveLength(0);
  });
});

describe("POST /api/publish/deploy-week: idempotent", () => {
  it("does not queue a piece twice when the week is deployed twice", async () => {
    await deploy();
    const second = await (await deploy()).json();
    expect(queued()).toHaveLength(2);
    expect(state.tables.publishing_jobs.filter((j) => j.target_platform === "linkedin_personal")).toHaveLength(2);
    expect(second.queued).toHaveLength(0);
    expect(second.alreadyQueued.map((q: Row) => q.pieceId).sort()).toEqual(["a", "b"]);
  });

  it("reports a queued post as already in the queue on a second deploy after its time has passed, never as not queued", async () => {
    await deploy();
    // Its posting time passes while it waits in the queue.
    state.tables.content_pieces[0].scheduled_date = "2020-01-06";
    const second = await (await deploy()).json();
    expect(second.alreadyQueued.map((q: Row) => q.pieceId).sort()).toEqual(["a", "b"]);
    expect(second.notQueued).toEqual([]);
    expect(queued()).toHaveLength(2);
  });

  it("reports a post queued on another of the company's accounts, or published, as already in the queue", async () => {
    state.tables.publishing_jobs.push(
      { id: "other-account", company_id: "company-1", content_piece_id: "a", target_platform: "linkedin_personal", status: "scheduled", social_account_id: "account-2" },
      { id: "done", company_id: "company-1", content_piece_id: "b", target_platform: "linkedin_personal", status: "published" },
    );
    const body = await (await deploy()).json();
    expect(queued()).toHaveLength(0);
    expect(body.alreadyQueued.map((q: Row) => [q.pieceId, q.status])).toEqual([["a", "scheduled"], ["b", "published"]]);
  });

  it("treats a failed job whose outcome was uncertain as possibly posted, and a plain failure as not", async () => {
    state.tables.publishing_jobs.push(
      { id: "unsure", company_id: "company-1", content_piece_id: "a", target_platform: "linkedin_personal", status: "failed", response_payload: { outcome_uncertain: true } },
      { id: "rejected", company_id: "company-1", content_piece_id: "b", target_platform: "linkedin_personal", status: "failed", response_payload: { outcome_uncertain: false } },
    );
    const body = await (await deploy()).json();
    expect(body.alreadyQueued).toEqual([expect.objectContaining({ pieceId: "a", status: "uncertain", note: expect.stringMatching(/may already have this post/) })]);
    expect(queued().map((q) => q.row.content_piece_id)).toEqual(["b"]);
  });

  it("leaves no duplicate when a deploy fails part way through and is run again", async () => {
    state.failPiece = "b";
    const first = await (await deploy()).json();
    expect(first.queued.map((q: Row) => q.pieceId)).toEqual(["a"]);
    expect(first.notQueued.map((n: Row) => n.pieceId)).toEqual(["b"]);
    state.failPiece = null;
    const second = await (await deploy()).json();
    expect(second.alreadyQueued.map((q: Row) => q.pieceId)).toEqual(["a"]);
    expect(second.queued.map((q: Row) => q.pieceId)).toEqual(["b"]);
    const jobs = state.tables.publishing_jobs.filter((j) => j.target_platform === "linkedin_personal");
    expect(jobs.map((j) => j.content_piece_id).sort()).toEqual(["a", "b"]);
  });

  it("opens the blog pull request once, for an admin on the AGENCY company, and not again on a second deploy", async () => {
    state.profile = { id: "admin-1", role: "admin", company_id: null, can_publish: true };
    state.tables.content_pieces.push(piece("blog", { content_type: "blog_article" }));
    decide("blog");
    const first = await (await deploy({ ctaCluster: "launch" })).json();
    expect(state.websiteCalls).toEqual([{ pieceId: "blog", ctaCluster: "launch" }]);
    expect(first.blogs[0]).toMatchObject({ id: "blog", status: "pull_request_opened" });
    const second = await (await deploy({ ctaCluster: "launch" })).json();
    expect(state.websiteCalls).toHaveLength(1);
    expect(second.blogs[0]).toMatchObject({ id: "blog", status: "already_sent" });
  });

  it("leaves the blog and the newsletter on the manual list for a client publisher", async () => {
    state.tables.content_pieces.push(piece("blog", { content_type: "blog_article" }), piece("news", { content_type: "linkedin_article" }));
    const body = await (await deploy({ ctaCluster: "launch" })).json();
    expect(state.websiteCalls).toHaveLength(0);
    expect(body.blogs[0]).toMatchObject({ id: "blog", status: "manual" });
    expect(body.newsletters[0]).toMatchObject({ id: "news", copyHref: "/content/news" });
  });
});
