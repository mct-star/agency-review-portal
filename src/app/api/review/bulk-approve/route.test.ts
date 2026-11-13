import { describe, it, expect, vi, beforeEach } from "vitest";

const pending = [
  { id: "p1", company_id: "c1", title: "A", markdown_body: "a", first_comment: null },
  { id: "p2", company_id: "c1", title: "B", markdown_body: "b", first_comment: "c" },
];
const calls: string[] = [];
const inserted: Array<Record<string, unknown>> = [];
let updatedIds: string[] = [];
let insertError: { message: string } | null = null;
let caller: { id: string; role: string; company_id: string | null } | null = { id: "u-michael", role: "admin", company_id: null };
const companyChecks: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  // The same gate as single approval: an admin, or a member of the week's company.
  requireCompanyUser: vi.fn(async (companyId: string) => {
    companyChecks.push(companyId);
    if (!caller) return null;
    return caller.role === "admin" || caller.company_id === companyId ? caller : null;
  }),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const h: Record<string, unknown> = {};
          h.eq = () => h;
          h.then = (resolve: (v: unknown) => void) => resolve({ count: 2 });
          return h;
        }
        return chain;
      };
      chain.eq = () => chain;
      chain.single = async () => ({ data: table === "weeks" ? { id: "w1", company_id: "c1" } : null, error: null });
      chain.in = () => chain;
      chain.returns = async () => ({ data: pending, error: null });
      chain.insert = async (rows: Array<Record<string, unknown>>) => {
        calls.push(`insert:${table}`);
        inserted.push(...rows);
        return { error: insertError };
      };
      chain.update = () => {
        calls.push(`update:${table}`);
        const u: Record<string, unknown> = {};
        u.in = (_c: string, ids: string[]) => { if (table === "content_pieces") updatedIds = ids; return u; };
        u.eq = () => u;
        u.select = async () => ({ data: updatedIds.map((id) => ({ id })), error: null });
        return u;
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://localhost/api/review/bulk-approve", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { caller = { id: "u-michael", role: "admin", company_id: null }; companyChecks.length = 0; calls.length = 0; inserted.length = 0; updatedIds = []; insertError = null; });

describe("POST /api/review/bulk-approve", () => {
  it("records one approval per pending piece, then approves exactly those pieces", async () => {
    const out = await (await POST(req({ weekId: "w1" }))).json();
    expect(calls.slice(0, 2)).toEqual(["insert:content_approvals", "update:content_pieces"]);
    expect(inserted.map((r) => r.piece_id)).toEqual(["p1", "p2"]);
    expect(inserted.every((r) => r.decided_by === "u-michael" && r.decided_via === "bulk_review")).toBe(true);
    expect(updatedIds).toEqual(["p1", "p2"]);
    expect(out.approvedCount).toBe(2);
  });

  it("changes nothing when the records cannot be written", async () => {
    insertError = { message: "boom" };
    const res = await POST(req({ weekId: "w1" }));
    expect(res.status).toBe(500);
    expect(calls).toEqual(["insert:content_approvals"]);
  });

  it("lets a member of the week's company approve it, recorded against them", async () => {
    caller = { id: "u-client", role: "client", company_id: "c1" };
    const res = await POST(req({ weekId: "w1" }));
    expect(res.status).toBe(200);
    expect(companyChecks).toEqual(["c1"]);
    expect(inserted.every((r) => r.decided_by === "u-client" && r.version_hash)).toBe(true);
  });

  it("refuses a member of another company and writes nothing", async () => {
    caller = { id: "u-other", role: "client", company_id: "c2" };
    const res = await POST(req({ weekId: "w1" }));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    caller = null;
    expect((await POST(req({ weekId: "w1" }))).status).toBe(401);
    expect(calls).toEqual([]);
  });
});
