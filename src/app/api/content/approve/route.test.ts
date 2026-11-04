import { describe, it, expect, vi, beforeEach } from "vitest";
import { pieceVersionHash } from "@/lib/content/version-hash";

const piece = { id: "p1", company_id: "c1", title: "Blog", markdown_body: "# Blog\n\nBody.", first_comment: null };
const calls: string[] = [];
const inserted: Array<Record<string, unknown>> = [];
let insertError: { message: string } | null = null;
let allowed = true;

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: vi.fn(async () => (allowed ? { id: "u-michael" } : null)),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.single = async () => ({ data: table === "content_pieces" ? piece : null, error: null });
      chain.insert = async (rows: Array<Record<string, unknown>>) => {
        calls.push(`insert:${table}`);
        inserted.push(...rows);
        return { error: insertError };
      };
      chain.update = () => {
        calls.push(`update:${table}`);
        const u: Record<string, unknown> = {};
        u.eq = () => u;
        u.select = () => ({ single: async () => ({ data: { id: "p1", approval_status: "approved" }, error: null }) });
        return u;
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://localhost/api/content/approve", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { calls.length = 0; inserted.length = 0; insertError = null; allowed = true; });

describe("POST /api/content/approve", () => {
  it("records the decision with the version hash and the decider before changing the status", async () => {
    const res = await POST(req({ pieceId: "p1", status: "approved" }));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["insert:content_approvals", "update:content_pieces"]);
    expect(inserted[0]).toMatchObject({
      piece_id: "p1", company_id: "c1", decision: "approved", decided_by: "u-michael",
      decided_via: "review", version_hash: pieceVersionHash(piece),
    });
  });

  it("records changes requested too", async () => {
    await POST(req({ pieceId: "p1", status: "changes_requested", note: "Hook is flat" }));
    expect(inserted[0]).toMatchObject({ decision: "changes_requested", note: "Hook is flat" });
  });

  it("changes nothing when the record cannot be written", async () => {
    insertError = { message: "relation does not exist" };
    const res = await POST(req({ pieceId: "p1", status: "approved" }));
    expect(res.status).toBe(500);
    expect(calls).toEqual(["insert:content_approvals"]);
  });

  it("refuses a caller outside the piece's company and records nothing", async () => {
    allowed = false;
    expect((await POST(req({ pieceId: "p1", status: "approved" }))).status).toBe(401);
    expect(calls).toEqual([]);
  });
});
