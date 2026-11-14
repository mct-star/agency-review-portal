import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// A small in-memory stand-in for the service-role client. It honours eq / in /
// gte / lte, enforces the reminder_log unique index, and THROWS if a
// company-scoped table is queried without a company_id filter, so a missing
// filter fails a test instead of quietly reading another company's rows.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    tables: {} as Record<string, Row[]>,
    calls: [] as Array<{ table: string; op: string; eq: Record<string, unknown> }>,
    clientsCreated: 0,
    sends: [] as Array<{ to: string; subject: string; html: string; from?: string }>,
    sendResult: { success: true } as { success: boolean; error?: string },
    deleteError: false,
    nextId: 1,
  };
  const SCOPED = ["posting_slots", "weeks", "users", "reminder_log", "content_pieces", "publishing_jobs"];

  function from(table: string) {
    const eq: Record<string, unknown> = {};
    const ins: Array<[string, unknown[]]> = [];
    const gte: Array<[string, string]> = [];
    const lte: Array<[string, string]> = [];
    let op = "select";
    let payload: Row | null = null;
    let single = false;

    const matching = () =>
      (state.tables[table] || []).filter(
        (r) =>
          Object.entries(eq).every(([k, v]) => r[k] === v) &&
          ins.every(([k, vs]) => vs.includes(r[k])) &&
          gte.every(([k, v]) => String(r[k]) >= v) &&
          lte.every(([k, v]) => String(r[k]) <= v),
      );

    const run = () => {
      state.calls.push({ table, op, eq: { ...eq } });
      if (SCOPED.includes(table) && op !== "insert" && eq.company_id === undefined) {
        throw new Error(`Unscoped ${op} on ${table}`);
      }
      if (table === "companies" && eq.id === undefined) throw new Error("Unscoped companies read");
      const rows = (state.tables[table] ||= []);
      if (op === "insert") {
        const row: Row = { ...payload!, id: `id-${state.nextId++}`, sent_at: new Date().toISOString() };
        if (table === "reminder_log") {
          const dup = rows.some((r) => ["company_id", "recipient", "kind", "subject_key", "is_follow_up"].every((k) => r[k] === row[k]));
          if (dup) return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        rows.push(row);
        return { data: single ? { id: row.id } : [row], error: null };
      }
      if (op === "delete") {
        if (state.deleteError) return { data: null, error: { message: "permission denied" } };
        const gone = new Set(matching());
        state.tables[table] = rows.filter((r) => !gone.has(r));
        return { data: null, error: null };
      }
      const found = matching();
      return { data: single ? found[0] ?? null : found, error: null };
    };

    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => { eq[k] = v; return b; },
      in: (k: string, vs: unknown[]) => { ins.push([k, vs]); return b; },
      gte: (k: string, v: string) => { gte.push([k, v]); return b; },
      lte: (k: string, v: string) => { lte.push([k, v]); return b; },
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      delete: () => { op = "delete"; return b; },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      single: () => { single = true; return Promise.resolve(run()); },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        try { return Promise.resolve(run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return b;
  }
  return { state, client: { from } };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => { h.state.clientsCreated += 1; return h.client; },
}));
vi.mock("@/lib/email/resend", () => ({
  sendEmail: async (o: { to: string; subject: string; html: string; from?: string }) => {
    h.state.sends.push(o);
    return h.state.sendResult;
  },
}));

import { GET } from "./route";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECRET = "s3cret";

const req = () => new Request("http://x/api/cron/reminders", { headers: { authorization: `Bearer ${SECRET}` } });
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const writes = () => h.state.calls.filter((c) => c.op === "insert" || c.op === "delete");
const logRows = () => h.state.tables.reminder_log || [];

function seedCompany(id: string, recipient: string, weekId: string, pieceId: string, weekStart = "2026-11-16", weekEnd = "2026-11-22") {
  const t = h.state.tables;
  (t.company_cadence ||= []).push({ company_id: id, mode: "weekly_batch", reminder_hour: 8, reminder_recipients: [recipient] });
  (t.companies ||= []).push({ id, timezone: "Europe/London", post_pack: "b2b" });
  (t.weeks ||= []).push({ id: weekId, company_id: id, date_start: weekStart, date_end: weekEnd, status: "ready_for_review" });
  (t.content_pieces ||= []).push({
    id: pieceId, company_id: id, week_id: weekId, title: "A post", content_type: "social_post", markdown_body: "Body",
    post_type: null, approval_status: "pending", day_of_week: "wednesday", scheduled_date: null, scheduled_time: "09:00:00",
  });
  (t.users ||= []).push({ company_id: id, email: recipient, full_name: "Sam Jones" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-16T09:00:00Z"); // Monday 09:00 in London, after the 08:00 reminder hour
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("REMINDERS_MODE", "send");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example");
  h.state.tables = {};
  h.state.calls = [];
  h.state.clientsCreated = 0;
  h.state.sends = [];
  h.state.sendResult = { success: true };
  h.state.deleteError = false;
  h.state.nextId = 1;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("GET /api/cron/reminders: secret", () => {
  it("refuses to run when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req())).status).toBe(503);
    expect(h.state.clientsCreated).toBe(0);
  });
  it("rejects a missing or wrong secret", async () => {
    expect((await GET(new Request("http://x/api/cron/reminders"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    expect(h.state.clientsCreated).toBe(0);
    expect(h.state.sends).toHaveLength(0);
  });
});

describe("GET /api/cron/reminders: REMINDERS_MODE switch", () => {
  it.each([undefined, "", "off", "SEND", "true"])("mode %s returns before any database read and sends nothing", async (value) => {
    seedCompany(A, "a@x.com", "w1", "p1");
    if (value === undefined) vi.stubEnv("REMINDERS_MODE", undefined as unknown as string);
    else vi.stubEnv("REMINDERS_MODE", value);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: true });
    expect(h.state.clientsCreated).toBe(0);
    expect(h.state.calls).toHaveLength(0);
    expect(h.state.sends).toHaveLength(0);
  });

  it("dry_run works out what is due but writes nothing and sends nothing", async () => {
    vi.stubEnv("REMINDERS_MODE", "dry_run");
    seedCompany(A, "a@x.com", "w1", "p1");
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: true, mode: "dry_run", totals: { due: 1, wouldSend: 1, sent: 0 } });
    expect(writes()).toHaveLength(0);
    expect(logRows()).toHaveLength(0);
    expect(h.state.sends).toHaveLength(0);
  });
});

describe("GET /api/cron/reminders: send", () => {
  it("sends once, logs first, and a second run in the same hour sends nothing", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    const first = await (await GET(req())).json();
    expect(first.totals).toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect(h.state.sends).toHaveLength(1);
    expect(h.state.sends[0]).toMatchObject({ to: "a@x.com", from: "AGENCY Bristol <mct@agencybristol.com>" });
    expect(h.state.sends[0].subject).toBe("Your content for 16 to 22 November is ready");
    expect(h.state.sends[0].html).toContain("https://portal.example/review/w1");
    expect(h.state.sends[0].html).toContain("Hi Sam,");
    // The insert came before the send: the row exists and carries the subject.
    expect(logRows()).toEqual([expect.objectContaining({ company_id: A, recipient: "a@x.com", kind: "week_ready", subject_key: "w1", is_follow_up: false })]);

    at("2026-11-16T09:30:00Z");
    const second = await (await GET(req())).json();
    expect(second.totals).toMatchObject({ due: 0, sent: 0 });
    expect(h.state.sends).toHaveLength(1);
    expect(logRows()).toHaveLength(1);
  });

  it("treats a unique violation as already sent and does not send", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    // A row the loader cannot see (older than its look-back) but the index would reject.
    (h.state.tables.reminder_log ||= []).push({ id: "old", company_id: A, recipient: "a@x.com", kind: "week_ready", subject_key: "w1", is_follow_up: false, sent_at: "2026-01-01T00:00:00.000Z" });
    const body = await (await GET(req())).json();
    expect(body.totals).toMatchObject({ alreadySent: 1, sent: 0 });
    expect(h.state.sends).toHaveLength(0);
  });

  it("sends the follow-up once and then stops", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    await GET(req()); // Monday: first send
    expect(h.state.sends).toHaveLength(1);

    at("2026-11-17T09:00:00Z"); // Tuesday: 24 hours before Wednesday 09:00 post
    const followUp = await (await GET(req())).json();
    expect(followUp.totals.sent).toBe(1);
    expect(h.state.sends).toHaveLength(2);
    expect(h.state.sends[1].subject).toBe("Reminder about 16 to 22 November");
    expect(logRows().filter((r) => r.is_follow_up)).toHaveLength(1);

    at("2026-11-17T10:00:00Z");
    await GET(req());
    at("2026-11-17T11:00:00Z");
    const after = await (await GET(req())).json();
    expect(after.totals.sent).toBe(0);
    expect(h.state.sends).toHaveLength(2);
  });

  it("sends at most one email per recipient per company-local day, by a fixed order", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    // A second week, fully approved and not deployed, also due on Monday.
    const t = h.state.tables;
    t.weeks.push({ id: "w2", company_id: A, date_start: "2026-11-23", date_end: "2026-11-29", status: "approved" });
    t.content_pieces.push({
      id: "p2", company_id: A, week_id: "w2", title: "B", content_type: "social_post", markdown_body: "Body",
      post_type: null, approval_status: "approved", day_of_week: "monday", scheduled_date: null, scheduled_time: "09:00:00",
    });

    const first = await (await GET(req())).json();
    expect(first.totals).toMatchObject({ due: 2, sent: 1, heldByDailyLimit: 1 });
    expect(h.state.sends).toHaveLength(1);
    expect(h.state.sends[0].subject).toContain("is ready"); // week_ready ranks before deploy_week

    at("2026-11-16T15:00:00Z"); // same day, later run
    const later = await (await GET(req())).json();
    expect(later.totals.sent).toBe(0);
    expect(h.state.sends).toHaveLength(1);

    at("2026-11-17T09:00:00Z"); // next day: the limit resets
    const next = await (await GET(req())).json();
    expect(next.totals.sent).toBe(1);
    expect(h.state.sends).toHaveLength(2);
  });

  it("removes the log row when the send fails, reports it, and retries next run", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    h.state.sendResult = { success: false, error: "provider down" };
    const failed = await (await GET(req())).json();
    expect(failed.ok).toBe(false);
    expect(failed.totals).toMatchObject({ sent: 0, failed: 1 });
    expect(failed.failures[0]).toMatchObject({ companyId: A, recipient: "a@x.com", kind: "week_ready", error: "provider down" });
    expect(logRows()).toHaveLength(0);
    const del = h.state.calls.find((c) => c.op === "delete")!;
    expect(del.eq).toMatchObject({ company_id: A });
    expect(del.eq.id).toBeDefined();

    h.state.sendResult = { success: true };
    at("2026-11-16T10:00:00Z");
    const retry = await (await GET(req())).json();
    expect(retry.totals.sent).toBe(1);
    expect(logRows()).toHaveLength(1);
  });

  it("flags a log row that could not be removed, so it is not silently lost", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    h.state.sendResult = { success: false, error: "provider down" };
    h.state.deleteError = true;
    const body = await (await GET(req())).json();
    expect(body.failures[0].logCleanupFailed).toBe(true);
  });

  it("leaves hospitality companies alone", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    h.state.tables.companies[0].post_pack = "hospitality";
    const body = await (await GET(req())).json();
    expect(body.companies[0].skipped).toBe("hospitality");
    expect(h.state.sends).toHaveLength(0);
    expect(h.state.calls.some((c) => c.table === "weeks")).toBe(false);
  });

  it("counts capture_due as not sent and never lets it use up the day", async () => {
    seedCompany(A, "a@x.com", "w1", "p1");
    // A shoot post a week out: capture_due is due, and has no email.
    h.state.tables.content_pieces.push({
      id: "p3", company_id: A, week_id: "w1", title: "Film", content_type: "video", markdown_body: "",
      post_type: "founder_video", approval_status: "pending", day_of_week: null, scheduled_date: "2026-11-23", scheduled_time: null,
    });
    const { ALL_POST_TYPES } = await import("@/lib/constants/post-types");
    const shoot = ALL_POST_TYPES.find((p) => p.capture === "shoot");
    if (shoot) h.state.tables.content_pieces[1].post_type = shoot.slug;
    const body = await (await GET(req())).json();
    expect(body.totals.sent).toBe(1);
    expect(body.totals.noTemplate).toBe(shoot ? 1 : 0);
    expect(h.state.sends[0].subject).toContain("is ready");
  });
});

describe("GET /api/cron/reminders: company isolation", () => {
  it("never reads or writes another company's rows, and sends each company its own links", async () => {
    seedCompany(A, "a@x.com", "wA", "pA");
    seedCompany(B, "b@y.com", "wB", "pB");
    const body = await (await GET(req())).json();
    expect(body.totals).toMatchObject({ sent: 2, failed: 0 });

    // The fake throws on any unscoped query to a company table, so reaching
    // here already means every query carried a company filter. Check them all
    // explicitly too: nothing but the cadence list and the company lookup.
    const scoped = h.state.calls.filter((c) => c.table !== "company_cadence");
    expect(scoped.length).toBeGreaterThan(0);
    for (const call of scoped) {
      if (call.table === "companies") expect([A, B]).toContain(call.eq.id);
      else if (call.op !== "insert") expect([A, B]).toContain(call.eq.company_id);
    }

    const toA = h.state.sends.find((s) => s.to === "a@x.com")!;
    const toB = h.state.sends.find((s) => s.to === "b@y.com")!;
    expect(toA.html).toContain("/review/wA");
    expect(toA.html).not.toContain("wB");
    expect(toB.html).toContain("/review/wB");
    expect(toB.html).not.toContain("wA");

    // Each log row belongs to the company whose recipient it names.
    expect(logRows()).toHaveLength(2);
    expect(logRows().find((r) => r.recipient === "a@x.com")).toMatchObject({ company_id: A, week_id: "wA" });
    expect(logRows().find((r) => r.recipient === "b@y.com")).toMatchObject({ company_id: B, week_id: "wB" });

    // A's run read only A's weeks and pieces.
    const aWeekReads = h.state.calls.filter((c) => c.table === "weeks" && c.eq.company_id === A);
    expect(aWeekReads).toHaveLength(1);
  });

  it("a failure in one company does not stop the next", async () => {
    seedCompany(A, "a@x.com", "wA", "pA");
    seedCompany(B, "b@y.com", "wB", "pB");
    h.state.tables.companies = h.state.tables.companies.filter((c) => c.id !== A); // A's company row is gone
    const body = await (await GET(req())).json();
    expect(body.companies.find((c: { companyId: string }) => c.companyId === A).skipped).toBe("company_not_found");
    expect(body.totals.sent).toBe(1);
    expect(h.state.sends.map((s) => s.to)).toEqual(["b@y.com"]);
  });
});
