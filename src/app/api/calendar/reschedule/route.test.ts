import { describe, it, expect, vi, beforeEach } from "vitest";

const profile = { id: "u1", role: "client", company_id: "c1" };
const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
let piece: Record<string, unknown> | null;
let weeks: Array<Record<string, unknown>>;

vi.mock("@/lib/supabase/server", () => ({ getUserProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const rows = () => (table === "weeks" ? weeks : piece ? [piece] : []).filter(r => filters.every(f => f(r)));
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.eq = (c: string, v: unknown) => { filters.push(r => r[c] === v); return chain; };
      chain.gt = (c: string, v: number) => { filters.push(r => (r[c] as number) > v); return chain; };
      chain.lte = (c: string, v: string) => { filters.push(r => (r[c] as string) <= v); return chain; };
      chain.gte = (c: string, v: string) => { filters.push(r => (r[c] as string) >= v); return chain; };
      chain.single = async () => ({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: "none" } });
      chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null });
      chain.update = (patch: Record<string, unknown>) => { updates.push({ table, patch }); return { eq: async () => ({ error: null }) }; };
      chain.insert = () => ({ select: () => ({ single: async () => ({ data: { id: "new-standalone" }, error: null }) }) });
      return chain;
    },
  }),
}));

import { PATCH } from "./route";

const req = (body: unknown) => new Request("http://localhost/api/calendar/reschedule", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  updates.length = 0;
  piece = { id: "p1", company_id: "c1", week_id: "w40", day_of_week: "monday", scheduled_date: "2026-09-28" };
  weeks = [
    { id: "s", company_id: "c1", week_number: 0, date_start: "2026-03-19", date_end: "2026-03-19" },
    { id: "w40", company_id: "c1", week_number: 40, date_start: "2026-09-28", date_end: "2026-10-04" },
    { id: "w41", company_id: "c1", week_number: 41, date_start: "2026-10-05", date_end: "2026-10-11" },
  ];
});

describe("PATCH /api/calendar/reschedule", () => {
  it("moves a post into another week, setting week, day and date together", async () => {
    const res = await PATCH(req({ pieceId: "p1", date: "2026-10-09" }));
    expect(res.status).toBe(200);
    expect(updates[0].patch).toEqual({ week_id: "w41", day_of_week: "friday", scheduled_date: "2026-10-09" });
  });

  it("sends a post back to the Unscheduled tray", async () => {
    await PATCH(req({ pieceId: "p1", date: null }));
    expect(updates[0].patch).toEqual({ week_id: "s", day_of_week: null, scheduled_date: null });
  });

  it("says so when no week covers the date", async () => {
    const res = await PATCH(req({ pieceId: "p1", date: "2027-02-01" }));
    expect(res.status).toBe(422);
    expect(updates).toEqual([]);
  });

  it("still takes a new day inside the post's own week, stored lowercase", async () => {
    await PATCH(req({ pieceId: "p1", newDayOfWeek: "Thursday" }));
    expect(updates[0].patch).toEqual({ week_id: "w40", day_of_week: "thursday", scheduled_date: "2026-10-01" });
  });

  it("refuses another company's post and a malformed date", async () => {
    piece = { ...piece!, company_id: "c2" };
    expect((await PATCH(req({ pieceId: "p1", date: "2026-10-09" }))).status).toBe(403);
    expect((await PATCH(req({ pieceId: "p1", date: "9 Oct" }))).status).toBe(400);
  });
});
