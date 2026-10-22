import { beforeEach, describe, expect, it, vi } from "vitest";
import { productionTestDb } from "@/lib/api-production/fake-db.test-helper";
const state = vi.hoisted(() => ({ admin: { id: "admin" } as { id: string } | null, db: null as unknown, after: vi.fn(), queue: vi.fn(), run: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: state.after }));
vi.mock("@/lib/supabase/admin", () => ({ requireAdmin: async () => state.admin, createAdminSupabaseClient: async () => state.db }));
vi.mock("@/lib/constants/week-board", () => ({ isWeekBoardEnabled: () => true }));
vi.mock("@/lib/api-production/runner", () => ({ runApiProductionJob: state.run }));
vi.mock("@/lib/api-production/queue", async (original) => ({ ...await original<typeof import("@/lib/api-production/queue")>(), queueApiProductionJob: state.queue }));
import { POST } from "./route";
import { POST as runWeek } from "../weeks/[weekId]/run/route";
const request = (body: unknown) => new Request("https://platform.test/api/admin/single-post", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks(); state.admin = { id: "admin" };
  state.db = productionTestDb({ companies: [{ id: "company-a" }], calendar_slots: [{ id: "slot-a", company_id: "company-a", day_of_week: "monday" }], weeks: [{ id: "week-a", company_id: "company-a" }] }).db;
  state.queue.mockResolvedValue({ id: "job-a", company_id: "company-a", status: "queued" });
});
describe("hosted authoring entry points", () => {
  it("refuses unsigned callers before queuing or starting work", async () => {
    state.admin = null;
    expect((await POST(request({ slotId: "slot-a" }))).status).toBe(401);
    expect((await runWeek(request({ mode: "fresh" }), { params: Promise.resolve({ weekId: "week-a" }) })).status).toBe(401);
    expect(state.queue).not.toHaveBeenCalled(); expect(state.after).not.toHaveBeenCalled();
  });
  it("takes company scope from the slot and starts only the hosted executor", async () => {
    expect((await POST(request({ slotId: "slot-a", companyId: "company-b" }))).status).toBe(200);
    expect(state.queue).toHaveBeenCalledWith(state.db, { companyId: "company-a", actorId: "admin", retryFailed: true, input: { kind: "slot", slot_id: "slot-a" } });
    await state.after.mock.calls[0][0]();
    expect(state.run).toHaveBeenCalledWith("job-a", "company-a");
  });
  it("validates a direct brief and does not re-execute a completed result", async () => {
    expect((await POST(request({ companyId: "company-a", postTypeSlug: "meme", topic: "" }))).status).toBe(400);
    expect((await POST(request({ companyId: "missing", postTypeSlug: "meme", topic: "Topic" }))).status).toBe(404);
    state.queue.mockResolvedValue({ id: "job-a", status: "completed" });
    expect((await POST(request({ companyId: "company-a", postTypeSlug: "meme", topic: "Topic" }))).status).toBe(200);
    expect(state.after).not.toHaveBeenCalled();
  });
  it("routes weekly fresh and resume through the same company-scoped API queue", async () => {
    expect((await runWeek(request({ mode: "resume" }), { params: Promise.resolve({ weekId: "week-a" }) })).status).toBe(200);
    expect(state.queue).toHaveBeenCalledWith(state.db, { companyId: "company-a", actorId: "admin", retryFailed: true, weekId: "week-a", input: { kind: "week", week_id: "week-a", mode: "resume" } });
    expect((await runWeek(request({ mode: "bad" }), { params: Promise.resolve({ weekId: "week-a" }) })).status).toBe(400);
  });

  it("persists the calendar date and time in a hosted job before returning to the browser", async () => {
    expect((await POST(request({ companyId: "company-a", postTypeSlug: "meme", topic: "Topic", postDate: "2027-01-01", postTime: "16:45:00" }))).status).toBe(200);
    expect(state.queue).toHaveBeenCalledWith(state.db, expect.objectContaining({ companyId: "company-a", input: {
      kind: "direct", direct: { post_type_slug: "meme", topic: "Topic", post_date: "2027-01-01", post_time: "16:45", pillar: null },
    } }));
  });

  it("refuses invalid calendar times before writing a hosted job", async () => {
    expect((await POST(request({ companyId: "company-a", postTypeSlug: "meme", topic: "Topic", postDate: "2027-01-01", postTime: "26:45" }))).status).toBe(400);
    expect(state.queue).not.toHaveBeenCalled();
  });
});
