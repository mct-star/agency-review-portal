import { describe, it, expect, vi, beforeEach } from "vitest";

let piece: Record<string, unknown> | null;
let existing: Array<Record<string, unknown>>;
let user: Record<string, unknown> | null;
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: vi.fn(async () => user),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: table === "content_pieces" ? piece : null, error: null });
      chain.then = (res: (v: unknown) => unknown) => res({ data: table === "publishing_jobs" ? existing : [], error: null });
      chain.insert = (row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return { select: () => ({ single: async () => ({ data: { id: "job1", ...row }, error: null }) }) };
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

const req = (body: unknown) => new Request("http://localhost/api/publish/newsletter", { method: "POST", body: JSON.stringify(body) });
const base = { id: "p1", company_id: "c1", content_type: "linkedin_article", approval_status: "approved" };

beforeEach(() => {
  inserted.length = 0;
  piece = { ...base };
  existing = [];
  user = { id: "u-michael", role: "admin", company_id: null };
});

describe("POST /api/publish/newsletter (Mark as published)", () => {
  it("records the piece as published with who and when", async () => {
    const before = Date.now();
    const res = await POST(req({ pieceId: "p1" }));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      table: "publishing_jobs", content_piece_id: "p1", company_id: "c1",
      target_platform: "linkedin_newsletter", status: "published", triggered_by: "u-michael",
    });
    expect(new Date(inserted[0].published_at as string).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses a piece that is not approved and records nothing", async () => {
    piece = { ...base, approval_status: "pending" };
    const res = await POST(req({ pieceId: "p1" }));
    expect(res.status).toBe(409);
    expect(inserted).toHaveLength(0);
  });

  it("refuses a piece that is not a LinkedIn article", async () => {
    piece = { ...base, content_type: "social_post" };
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(422);
    expect(inserted).toHaveLength(0);
  });

  it("does not record it twice", async () => {
    existing = [{ id: "old", published_at: "2026-11-12T10:00:00Z" }];
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(409);
    expect(inserted).toHaveLength(0);
  });

  it("refuses someone outside the company, or a client without the publish right", async () => {
    user = null;
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(401);
    user = { id: "u2", role: "client", company_id: "c1", can_publish: false };
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it("allows a client with can_publish for their own company", async () => {
    user = { id: "u2", role: "client", company_id: "c1", can_publish: true };
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(200);
  });
});
