import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const inserted: Array<Record<string, unknown>> = [];
let insertError: { message: string } | null = null;

vi.mock("@/lib/hospitality/access", () => ({
  authorisePiece: vi.fn(async () => ({
    ok: true,
    profile: { id: "u-venue", role: "client", company_id: "c1" },
    piece: { id: "p1", company_id: "c1", week_id: "w1", approval_status: "pending", auto_source: null, post_type: null },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({ data: { id: "p1", company_id: "c1", title: "T", markdown_body: "Body", first_comment: null }, error: null });
      chain.insert = async (rows: Array<Record<string, unknown>>) => {
        calls.push(`insert:${table}`);
        inserted.push(...rows);
        return { error: insertError };
      };
      chain.update = () => {
        calls.push(`update:${table}`);
        return { eq: async () => ({ error: null }) };
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

const call = (decision: string) =>
  POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ decision }) }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => { calls.length = 0; inserted.length = 0; insertError = null; });

describe("POST /api/hospitality/pieces/[id]/decision approve", () => {
  it("records the approval with its version hash before the status changes", async () => {
    const res = await call("approve");
    expect(res.status).toBe(200);
    expect(calls).toEqual(["insert:content_approvals", "update:content_pieces"]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ piece_id: "p1", company_id: "c1", decision: "approved", decided_by: "u-venue" });
    expect(String(inserted[0].version_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes nothing when the record cannot be written", async () => {
    insertError = { message: "boom" };
    const res = await call("approve");
    expect(res.status).toBe(500);
    expect(calls).toEqual(["insert:content_approvals"]);
  });
});
