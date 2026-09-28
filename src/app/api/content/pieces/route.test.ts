import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<Record<string, unknown>> = [];
let standalone: { id: string } | null;

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: vi.fn(async () => ({ id: "u1" })),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: table === "weeks" ? standalone : table === "content_pieces" ? { id: "p1", company_id: "c1" } : null,
        error: null,
      });
      chain.single = async () => ({ data: null, error: null });
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

beforeEach(() => { inserts.length = 0; updates.length = 0; standalone = { id: "s" }; });

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
});
