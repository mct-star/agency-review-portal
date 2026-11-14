import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
type Query = { table: string; filters: Array<{ op: string; col: string; val: any }> };
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, queries: [] as any[], writes: [] as string[] }));

function valueOf(row: Row, col: string) {
  const [head, key] = col.split("->>");
  return key ? row[head]?.[key] : row[head];
}
const matches = (row: Row, f: { op: string; col: string; val: any }) => {
  const v = valueOf(row, f.col);
  if (f.op === "eq") return v === f.val;
  if (f.op === "in") return f.val.includes(v);
  if (f.op === "gte") return v >= f.val;
  if (f.op === "lte") return v <= f.val;
  return true;
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const query: Query = { table, filters: [] };
      state.queries.push(query);
      const run = () => ({ data: (state.tables[table] || []).filter((r) => query.filters.every((f) => matches(r, f))), error: null });
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        eq: (col: string, val: any) => (query.filters.push({ op: "eq", col, val }), q),
        in: (col: string, val: any[]) => (query.filters.push({ op: "in", col, val }), q),
        gte: (col: string, val: any) => (query.filters.push({ op: "gte", col, val }), q),
        lte: (col: string, val: any) => (query.filters.push({ op: "lte", col, val }), q),
        filter: (col: string, _op: string, val: any) => (query.filters.push({ op: "eq", col, val }), q),
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        then: (resolve: any) => Promise.resolve(run()).then(resolve),
      };
      for (const w of ["insert", "update", "upsert", "delete"]) q[w] = () => (state.writes.push(`${w}:${table}`), q);
      return q;
    },
    rpc: () => (state.writes.push("rpc"), Promise.resolve({ data: null, error: null })),
  }),
}));

import { contentSignature } from "./auth";
import { withContentPrincipal } from "./principal";
import { waiting } from "./waiting";
import { loadCompanyReminderData } from "@/lib/reminders/load";
import { GET, POST } from "@/app/api/ops-content/[...path]/route";

const A = "d338c3ca-7f6b-4ea8-9fff-c052ba91bbdd", B = "0c1f7a52-3c86-4a1e-9a0e-5a3d9b6a1b11";
const ADMIN = "94be5301-3e78-4257-9d41-780a760e9135", secret = "test-content-bridge-secret-at-least-32-chars";
const NOW = new Date("2026-11-17T09:00:00Z"); // Tuesday; London is on GMT
const principal = { id: ADMIN, role: "admin" as const, companyId: A, model: "m", modelLabel: "M" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const week = (n: number, company: string, start: string, end: string, status: string) => ({ id: id(n), company_id: company, date_start: start, date_end: end, status });
const piece = (n: number, company: string, weekN: number, date: string, o: Row = {}) => ({ id: id(n), company_id: company, week_id: id(weekN), title: `Piece ${n}`, content_type: "social_post", markdown_body: "Body", post_type: "tactical", approval_status: "pending", day_of_week: null, scheduled_date: date, scheduled_time: "09:00", ...o });
const talking = { post_type: "talking_head", content_type: "video_script" };

function seed() {
  state.queries = []; state.writes = [];
  state.tables = {
    companies: [{ id: A, timezone: "Europe/London", post_pack: "b2b" }, { id: B, timezone: "Europe/London", post_pack: "b2b" }, { id: id(900), timezone: "Europe/London", post_pack: "hospitality" }],
    users: [{ id: ADMIN, role: "admin", email: "mct@agencybristol.com" }],
    weeks: [
      week(1, A, "2026-11-16", "2026-11-22", "ready_for_review"),
      week(2, A, "2026-11-23", "2026-11-29", "approved"),
      week(3, A, "2026-11-30", "2026-12-06", "approved"),
      week(11, B, "2026-11-16", "2026-11-22", "ready_for_review"),
      week(12, B, "2026-11-23", "2026-11-29", "approved"),
    ],
    content_pieces: [
      piece(101, A, 1, "2026-11-18", { approval_status: "approved" }),
      piece(102, A, 1, "2026-11-17"), // today, not approved
      piece(103, A, 1, "2026-11-19", talking), // needs recording
      piece(104, A, 1, "2026-11-20", { ...talking, title: "Footage in" }), // raw footage uploaded
      piece(105, A, 1, "2026-11-17", { content_type: "linkedin_article", approval_status: "approved", title: "Newsletter" }),
      piece(106, A, 1, "2026-11-16", { content_type: "linkedin_article", approval_status: "approved", title: "Already published" }),
      piece(201, A, 2, "2026-11-24", { approval_status: "approved" }),
      piece(301, A, 3, "2026-12-01", { approval_status: "approved" }),
      piece(111, B, 11, "2026-11-17"), // company B: today, unapproved
      piece(112, B, 11, "2026-11-18", talking), // company B: needs recording
      piece(113, B, 11, "2026-11-19", { ...talking, content_type: "linkedin_article", approval_status: "approved" }),
      piece(211, B, 12, "2026-11-24", { approval_status: "approved" }),
    ],
    publishing_jobs: [
      { company_id: A, content_piece_id: id(106), target_platform: "linkedin_newsletter", status: "published" },
      { company_id: A, content_piece_id: id(301), target_platform: "linkedin_personal", status: "scheduled" }, // week 3 deployed
    ],
    content_assets: [
      { content_piece_id: id(104), asset_type: "custom", asset_metadata: { type: "raw_video" } },
      { content_piece_id: id(112), asset_type: "custom", asset_metadata: { type: "raw_video" } }, // company B
      { content_piece_id: id(103), asset_type: "custom", asset_metadata: { type: "rendered_video" } }, // a render is not raw footage
    ],
    posting_slots: [], reminder_log: [],
  };
}
const asA = (now = NOW) => withContentPrincipal(principal, () => waiting(now));

beforeEach(() => {
  seed();
  process.env.NEXT_PUBLIC_APP_URL = "https://portal.test";
  process.env.CONTENT_BRIDGE_SECRET = secret; process.env.CONTENT_BRIDGE_COMPANY_ID = A; process.env.CONTENT_BRIDGE_USER_ID = ADMIN;
  process.env.CONTENT_BRIDGE_ACTOR_EMAIL = "mct@agencybristol.com";
});

function signed(method: string, path: string, tamper = false) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = contentSignature(method, path, timestamp, new Uint8Array(), secret);
  return new Request(`https://portal.test${path}`, { method, headers: { "x-content-timestamp": timestamp, "x-content-signature": tamper ? "0".repeat(64) : signature } });
}

describe("GET /api/ops-content/waiting auth", () => {
  it("refuses a missing signature and a wrong signature", async () => {
    const missing = await GET(new Request("https://portal.test/api/ops-content/waiting"));
    expect(missing.status).toBe(401);
    const wrong = await GET(signed("GET", "/api/ops-content/waiting", true));
    expect(wrong.status).toBe(401);
    expect(state.queries.filter((q) => q.table !== "users")).toEqual([]);
  });
  it("is a GET only: a signed POST to it is not found, and a signed GET writes nothing", async () => {
    expect((await POST(signed("POST", "/api/ops-content/waiting"))).status).toBe(404);
    expect((await GET(signed("GET", "/api/ops-content/waiting"))).status).toBe(200);
    expect(state.writes).toEqual([]);
  });
  it("returns the agreed shape for a signed request", async () => {
    const res = await GET(signed("GET", "/api/ops-content/waiting"));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["asOf", "items", "recordings"]);
    for (const item of body.items) expect(Object.keys(item).sort()).toEqual(["count", "href", "kind", "label"]);
    for (const r of body.recordings) expect(Object.keys(r).sort()).toEqual(["capture", "date", "href", "pieceId", "title"]);
    expect(typeof body.asOf).toBe("string");
  });
});

describe("waiting states", () => {
  it("lists all four states with the agreed labels and links, in a fixed order", async () => {
    const out = await asA();
    expect(out.asOf).toBe("2026-11-17T09:00:00.000Z");
    expect(out.items).toEqual([
      { kind: "week_ready", count: 1, label: "1 week to review", href: `https://portal.test/review/${id(1)}` },
      { kind: "deploy_week", count: 1, label: "1 approved week to deploy", href: `https://portal.test/review/${id(2)}/deploy` },
      { kind: "todays_post", count: 1, label: "1 post to approve today", href: `https://portal.test/content/${id(102)}` },
      { kind: "manual_publish", count: 1, label: "1 newsletter to publish", href: `https://portal.test/content/${id(105)}` },
    ]);
  });
  it("pluralises and links the earliest of several", async () => {
    state.tables.content_pieces.push(piece(107, A, 1, "2026-11-17", { title: "Second today" }));
    state.tables.weeks.push(week(4, A, "2026-12-01", "2026-12-07", "ready_for_review"));
    state.tables.content_pieces.push(piece(401, A, 4, "2026-12-02"));
    state.tables.publishing_jobs.pop(); // week 3 is no longer deployed
    const out = await asA();
    const byKind = Object.fromEntries(out.items.map((i) => [i.kind, i]));
    expect(byKind.week_ready).toMatchObject({ count: 2, label: "2 weeks to review", href: `https://portal.test/review/${id(1)}` });
    expect(byKind.deploy_week).toMatchObject({ count: 2, label: "2 approved weeks to deploy", href: `https://portal.test/review/${id(2)}/deploy` });
    expect(byKind.todays_post).toMatchObject({ count: 2, label: "2 posts to approve today" });
  });
  it("omits a kind with nothing waiting", async () => {
    state.tables.content_pieces.find((p) => p.id === id(102))!.approval_status = "approved";
    state.tables.content_pieces.find((p) => p.id === id(103))!.approval_status = "approved";
    state.tables.content_pieces.find((p) => p.id === id(104))!.approval_status = "approved";
    const out = await asA();
    expect(out.items.map((i) => i.kind)).toEqual(["deploy_week", "manual_publish"]); // week 1 is fully approved, so not "to review"
  });
  it("does not list a deploy week that is deployed, not approved, or has an unapproved piece", async () => {
    state.tables.weeks.find((w) => w.id === id(2))!.status = "ready_for_review";
    const out = await asA();
    expect(out.items.find((i) => i.kind === "deploy_week")).toBeUndefined(); // week 3 deployed, week 2 not approved
    state.tables.weeks.find((w) => w.id === id(2))!.status = "approved";
    state.tables.content_pieces.find((p) => p.id === id(201))!.approval_status = "pending";
    expect((await asA()).items.find((i) => i.kind === "deploy_week")).toBeUndefined();
  });
  it("returns empty arrays when nothing is waiting", async () => {
    state.tables.weeks = state.tables.weeks.filter((w) => w.company_id !== A);
    expect(await asA()).toEqual({ asOf: "2026-11-17T09:00:00.000Z", items: [], recordings: [] });
  });
  it("returns empty arrays, not an error, for a hospitality company or a missing company", async () => {
    for (const companyId of [id(900), id(999)]) {
      expect(await withContentPrincipal({ ...principal, companyId }, () => waiting(NOW))).toEqual({ asOf: NOW.toISOString(), items: [], recordings: [] });
    }
  });
});

describe("recordings", () => {
  it("lists a piece that needs recording, and not one with raw footage uploaded", async () => {
    const out = await asA();
    expect(out.recordings).toEqual([{ pieceId: id(103), title: "Piece 103", date: "2026-11-19", capture: "casual", href: `https://portal.test/content/${id(103)}` }]);
  });
  it("passes `captured` to the reminder rules: raw footage only, and a render does not count", async () => {
    const loaded = await loadCompanyReminderData((await (await import("@/lib/supabase/admin")).createAdminSupabaseClient()) as any, { company_id: A, mode: "weekly_batch", reminder_hour: 8, reminder_recipients: [] }, NOW);
    if (loaded.status !== "ok") throw new Error("expected ok");
    expect(Object.fromEntries(loaded.data.input.captures.map((c) => [c.id, c.captured]))).toEqual({ [id(103)]: false, [id(104)]: true });
  });
});

describe("company isolation", () => {
  it("never queries or returns another company's weeks, pieces or assets", async () => {
    const out = await asA();
    const text = JSON.stringify(out);
    for (const other of [11, 12, 111, 112, 113, 211]) expect(text).not.toContain(id(other));
    const aPieces = new Set(state.tables.content_pieces.filter((p) => p.company_id === A).map((p) => p.id));
    for (const q of state.queries as Query[]) {
      if (q.table === "content_assets") {
        const ids = q.filters.find((f) => f.col === "content_piece_id")?.val as string[];
        expect(ids?.length).toBeGreaterThan(0);
        for (const pieceId of ids) expect(aPieces.has(pieceId)).toBe(true);
      } else if (q.table === "companies") {
        expect(q.filters).toContainEqual({ op: "eq", col: "id", val: A });
      } else {
        expect(q.filters).toContainEqual({ op: "eq", col: "company_id", val: A });
      }
    }
    expect(state.writes).toEqual([]);
  });
  it("reads company B only when the bridge is configured for B", async () => {
    const out = await withContentPrincipal({ ...principal, companyId: B }, () => waiting(NOW));
    const text = JSON.stringify(out);
    expect(text).toContain(id(111));
    expect(text).not.toContain(id(102));
    expect(out.recordings.map((r) => r.pieceId)).toEqual([id(113)]); // 112 has footage, and A's pieces never appear
  });
});
