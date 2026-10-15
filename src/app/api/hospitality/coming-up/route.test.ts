import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

/**
 * The Coming up routes: every read and write is scoped to the caller's
 * company. Two companies, A and B; the caller belongs to A.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ITEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const state: { user: Record<string, unknown> | null; supabase: ReturnType<typeof fakeSupabase> } = { user: null, supabase: fakeSupabase() };

vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => state.user,
  createAdminSupabaseClient: async () => state.supabase.client,
}));
const readImage = vi.fn(async () => "{}");
vi.mock("@/lib/providers/content-adaptation/claude-util", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  callTextWithImage: async () => ({ text: await readImage(), provider: "claude", model: "m" }),
}));

import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as extract } from "./extract/route";
import { POST as confirm } from "./confirm/route";

const venue = (id: string, pack = "hospitality") => ({ id, name: "Lakeside", timezone: "Europe/London", post_pack: pack });
const row = (id: string, company: string, over: Record<string, unknown> = {}) => ({
  id, company_id: company, kind: "event", title: "Quiz night", details: null, starts_on: "2099-01-01", ends_on: null,
  start_time: "19:30", build_up: { week: true, two_days: true, day_of: true }, status: "active", source: "manual", ...over,
});

/** venue_calendar_items answers by what was asked: an insert echoes its rows, a lookup by id finds that row. */
function itemsTable(rows: ReturnType<typeof row>[]) {
  return (calls: RecordedCall[]) => {
    const insert = calls.find((c) => c.method === "insert");
    if (insert) {
      const ins = insert.args[0] as Record<string, unknown>[];
      return { data: ins.map((r, i) => ({ id: `new-${i}`, build_up: { week: true, two_days: true, day_of: true }, status: "active", ...r })) };
    }
    const update = calls.find((c) => c.method === "update");
    const idEq = calls.find((c) => c.method === "eq" && c.args[0] === "id");
    const coEq = calls.find((c) => c.method === "eq" && c.args[0] === "company_id");
    let found = rows.filter((r) => (!idEq || r.id === idEq.args[1]) && (!coEq || r.company_id === coEq.args[1]));
    if (update) found = found.map((r) => ({ ...r, ...(update.args[0] as Record<string, unknown>) }));
    return { data: idEq ? found[0] ?? null : found };
  };
}

const json = (body: Record<string, unknown>, method = "POST") =>
  new Request("http://x/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const eqCalls = (table: string) => state.supabase.calls.filter((c) => c.table === table && c.method === "eq").map((c) => c.args);
const inserts = () => state.supabase.calls.filter((c) => c.table === "venue_calendar_items" && c.method === "insert");

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A };
  state.supabase = fakeSupabase({ companies: { data: venue(A) }, venue_calendar_items: itemsTable([row(ITEM_A, A), row(ITEM_B, B)]) });
});

describe("GET /api/hospitality/coming-up", () => {
  it("lists the caller's own company only, with each item's next post", async () => {
    const res = await GET(new Request(`http://x/api?companyId=${A}`));
    expect(res.status).toBe(200);
    expect(eqCalls("venue_calendar_items")).toContainEqual(["company_id", A]);
    const body = await res.json();
    expect(body.items.every((i: { company_id: string }) => i.company_id === A)).toBe(true);
    expect(body.items[0].next).toMatch(/Save-the-date post drafts on/);
  });
  it("refuses another company's list and a signed-out caller", async () => {
    expect((await GET(new Request(`http://x/api?companyId=${B}`))).status).toBe(403);
    state.user = null;
    expect((await GET(new Request(`http://x/api?companyId=${A}`))).status).toBe(401);
  });
  it("tells a business-to-business company plainly that this is for venues", async () => {
    state.supabase = fakeSupabase({ companies: { data: venue(A, "b2b") } });
    const res = await GET(new Request(`http://x/api?companyId=${A}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This is for venues");
  });
});

describe("POST /api/hospitality/coming-up (quick add)", () => {
  const good = { companyId: A, kind: "event", title: "Wine tasting", startsOn: "2099-01-01", time: "7pm" };
  it("saves into the caller's company and nowhere else", async () => {
    vi.setSystemTime(new Date("2098-12-01T09:00:00Z"));
    const res = await POST(json(good));
    vi.useRealTimers();
    expect(res.status).toBe(201);
    const rows = inserts()[0].args[0] as Record<string, unknown>[];
    expect(rows).toEqual([expect.objectContaining({ company_id: A, title: "Wine tasting", start_time: "19:00", source: "manual" })]);
  });
  it("refuses a date that is not real, with a plain reason", async () => {
    const res = await POST(json({ ...good, startsOn: "2026-02-30" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no clear date/);
    expect(inserts()).toHaveLength(0);
  });
  it("refuses to add to another company", async () => {
    expect((await POST(json({ ...good, companyId: B }))).status).toBe(403);
    expect(inserts()).toHaveLength(0);
  });
});

describe("PATCH /api/hospitality/coming-up/[id]", () => {
  const patch = (id: string, body: Record<string, unknown>) => PATCH(json(body, "PATCH"), { params: Promise.resolve({ id }) });
  it("cannot read or edit another company's item: it answers as if it did not exist", async () => {
    const res = await patch(ITEM_B, { status: "cancelled" });
    expect(res.status).toBe(404);
    expect(state.supabase.calls.some((c) => c.table === "venue_calendar_items" && c.method === "update")).toBe(false);
  });
  it("cancels the caller's own item, scoped to its company", async () => {
    const res = await patch(ITEM_A, { status: "cancelled" });
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ status: "cancelled", next: expect.stringMatching(/Cancelled/) });
    expect(eqCalls("venue_calendar_items")).toContainEqual(["company_id", A]);
  });
  it("switches one build-up post off and leaves the others", async () => {
    await patch(ITEM_A, { buildUp: { week: false } });
    const update = state.supabase.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ build_up: { week: false, two_days: true, day_of: true } });
  });
  it("checks an edit like a new item", async () => {
    expect((await patch(ITEM_A, { endsOn: "2098-01-01" })).status).toBe(400);
    expect((await patch(ITEM_A, { status: "deleted" })).status).toBe(400);
  });
  it("lets an admin edit any company's item", async () => {
    state.user = { id: "adm", role: "admin", company_id: null };
    expect((await patch(ITEM_B, { status: "cancelled" })).status).toBe(200);
  });
});

describe("POST /api/hospitality/coming-up/extract", () => {
  const upload = (file: Blob, name: string, companyId = A) => {
    const form = new FormData();
    form.set("companyId", companyId);
    form.set("file", file, name);
    return extract(new Request("http://x/api", { method: "POST", body: form }));
  };
  it("reads a calendar file and saves nothing", async () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Quiz night\r\nDTSTART;TZID=Europe/London:20991231T193000\r\nEND:VEVENT\r\nEND:VCALENDAR";
    vi.setSystemTime(new Date("2099-12-01T09:00:00Z"));
    const res = await upload(new Blob([ics], { type: "text/calendar" }), "events.ics");
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect((await res.json()).found).toEqual([{ kind: "event", title: "Quiz night", details: null, startsOn: "2099-12-31", endsOn: null, time: "19:30" }]);
    expect(inserts()).toHaveLength(0);
  });
  it("reads a photo of a board through the provider module", async () => {
    readImage.mockResolvedValueOnce(JSON.stringify({ upcoming: [{ kind: "launch", title: "Autumn menu", startsOn: "2099-12-20" }], undated: ["Live music"] }));
    vi.setSystemTime(new Date("2099-12-01T09:00:00Z"));
    const res = await upload(new Blob([new Uint8Array(100)], { type: "image/jpeg" }), "board.jpg");
    vi.useRealTimers();
    const body = await res.json();
    expect(body.found).toHaveLength(1);
    expect(body.notes.join(" ")).toMatch(/Live music was not added/);
  });
  it("refuses a file it cannot read, and another company", async () => {
    expect((await upload(new Blob(["x"], { type: "application/zip" }), "a.zip")).status).toBe(400);
    expect((await upload(new Blob(["x"], { type: "text/calendar" }), "a.ics", B)).status).toBe(403);
  });
});

describe("POST /api/hospitality/coming-up/confirm", () => {
  it("saves the ticked items into the caller's company, checked again", async () => {
    vi.setSystemTime(new Date("2099-12-01T09:00:00Z"));
    const res = await confirm(json({ companyId: A, items: [{ kind: "event", title: "Quiz night", startsOn: "2099-12-31" }, { kind: "event", title: "Ghost", startsOn: "nope" }] }));
    vi.useRealTimers();
    expect(res.status).toBe(200);
    const rows = inserts()[0].args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ company_id: A, source: "upload" });
    expect((await res.json()).notes.join(" ")).toMatch(/Ghost was left out/);
  });
  it("does not add the same thing twice", async () => {
    // ITEM_A is "Quiz night" on 2099-01-01 already.
    vi.setSystemTime(new Date("2098-12-01T09:00:00Z"));
    const res = await confirm(json({ companyId: A, items: [{ kind: "event", title: "The quiz night", startsOn: "2099-01-01" }] }));
    vi.useRealTimers();
    expect(inserts()).toHaveLength(0);
    expect((await res.json()).notes.join(" ")).toMatch(/already on the list/);
  });
  it("refuses another company", async () => {
    expect((await confirm(json({ companyId: B, items: [{ kind: "event", title: "x", startsOn: "2099-12-31" }] }))).status).toBe(403);
  });
});
