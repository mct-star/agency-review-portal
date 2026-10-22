import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<Record<string, unknown>> = [];
let standalone: { id: string } | null;
let planned: { id: string; date_start: string; date_end: string } | null;
let allowed = true;

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: vi.fn(async () => allowed ? { id: "u1" } : null),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      let coveringDate = false;
      for (const m of ["select", "eq", "order", "limit", "gt", "gte"]) chain[m] = () => chain;
      chain.lte = () => { coveringDate = true; return chain; };
      chain.maybeSingle = async () => ({
        data: table === "weeks" ? coveringDate ? planned : planned || standalone : table === "content_pieces" ? { id: "p1", company_id: "c1" } : null,
        error: null,
      });
      chain.single = async () => ({ data: null, error: null });
      chain.upsert = async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        planned = { id: "new-planned", date_start: String(row.date_start), date_end: String(row.date_end) };
        return { error: null };
      };
      chain.insert = (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        const id = table === "weeks" ? "new-standalone" : "piece-1";
        return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
      };
      chain.update = (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; };
      return chain;
    },
  }),
}));

import { PATCH, POST } from "./route";

const req = (method: string, body: unknown) =>
  new Request("http://localhost/api/content/pieces", { method, body: JSON.stringify(body) });

beforeEach(() => { inserts.length = 0; updates.length = 0; standalone = { id: "s" }; planned = null; allowed = true; });

describe("/api/content/pieces", () => {
  it("sends a post to review unscheduled, in the standalone week with its image as the cover", async () => {
    const out = await (await POST(req("POST", { companyId: "c1", unscheduled: true, postType: "insight", markdownBody: "A line.", imageUrl: "https://x/i.png" }))).json();
    expect(out).toMatchObject({ id: "piece-1", weekId: "s", weekNumber: null });
    const piece = inserts.find((i) => i.table === "content_pieces")!.row;
    expect(piece).toMatchObject({ week_id: "s", approval_status: "pending", cover_image_url: "https://x/i.png" });
    expect(piece.day_of_week).toBeUndefined();
  });

  it("makes the standalone week when the company has none", async () => {
    standalone = null;
    const out = await (await POST(req("POST", { companyId: "c1", unscheduled: true, markdownBody: "A line." }))).json();
    expect(out.weekId).toBe("new-standalone");
    expect(inserts[0]).toMatchObject({ table: "weeks", row: { week_number: 0 } });
  });

  it("still needs a week or unscheduled", async () => {
    expect((await POST(req("POST", { companyId: "c1", markdownBody: "A line." }))).status).toBe(400);
  });

  it("saves edits to an existing post", async () => {
    const out = await (await PATCH(req("PATCH", { pieceId: "p1", markdownBody: "New words here", firstComment: "" }))).json();
    expect(out.updated).toBe(true);
    expect(updates[0]).toEqual({ markdown_body: "New words here", word_count: 3, first_comment: null });
  });

  it("saves the calendar company's exact date and time as pending, without publishing", async () => {
    planned = { id: "week-53", date_start: "2026-12-28", date_end: "2027-01-03" };
    const response = await POST(req("POST", { companyId: "c1", scheduledDate: "2027-01-01", scheduledTime: "09:45:00", markdownBody: "A planned draft", status: "approved" }));
    expect(response.status).toBe(200);
    expect(inserts.find((entry) => entry.table === "content_pieces")?.row).toMatchObject({
      company_id: "c1", week_id: "week-53", day_of_week: "friday", scheduled_date: "2027-01-01", scheduled_time: "09:45:00", approval_status: "pending",
    });
    expect(inserts.some((entry) => entry.table === "publishing_jobs")).toBe(false);
  });

  it("creates the ISO week for a future recurring slot with no week row yet", async () => {
    const response = await POST(req("POST", { companyId: "c1", scheduledDate: "2027-01-01", scheduledTime: "09:45", markdownBody: "A planned draft" }));
    expect(response.status).toBe(200);
    expect(inserts.find((entry) => entry.table === "weeks")?.row).toMatchObject({ company_id: "c1", week_number: 53, year: 2026, date_start: "2026-12-28", date_end: "2027-01-03" });
    expect(inserts.find((entry) => entry.table === "content_pieces")?.row).toMatchObject({ week_id: "new-planned", scheduled_date: "2027-01-01", scheduled_time: "09:45:00", approval_status: "pending" });
  });

  it("rejects invalid calendar context and unauthorised company access before creating anything", async () => {
    for (const body of [
      { scheduledDate: "2027-02-30", scheduledTime: "09:00" },
      { scheduledDate: "2027-01-01", scheduledTime: "24:30" },
      { scheduledTime: "09:00", unscheduled: true },
    ]) expect((await POST(req("POST", { companyId: "c1", markdownBody: "A draft", ...body }))).status).toBe(400);
    allowed = false;
    expect((await POST(req("POST", { companyId: "other-company", markdownBody: "A draft", scheduledDate: "2027-01-01" }))).status).toBe(401);
    expect(inserts).toEqual([]);
  });

  it("refuses an unrelated spokesperson on a planned draft", async () => {
    expect((await POST(req("POST", { companyId: "c1", spokespersonId: "foreign-person", markdownBody: "A draft", scheduledDate: "2027-01-01" }))).status).toBe(403);
    expect(inserts).toEqual([]);
  });
});
