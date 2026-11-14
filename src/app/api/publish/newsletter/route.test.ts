import { describe, it, expect, vi, beforeEach } from "vitest";

let piece: Record<string, unknown> | null;
let existing: Array<Record<string, unknown>>;
let user: Record<string, unknown> | null;
let insertError: { message: string; code?: string } | null;
let postPack: string;
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/admin", () => ({
  // The same gate as the real one: an admin, or a member of that company.
  requireCompanyUser: vi.fn(async (companyId: string) => {
    if (!user) return null;
    return user.role === "admin" || user.company_id === companyId ? user : null;
  }),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: table === "content_pieces" ? piece : table === "companies" ? { post_pack: postPack } : null,
        error: null,
      });
      chain.then = (res: (v: unknown) => unknown) => res({ data: table === "publishing_jobs" ? existing : [], error: null });
      chain.insert = (row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return { select: () => ({ single: async () => (insertError ? { data: null, error: insertError } : { data: { id: "job1", ...row }, error: null }) }) };
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
  insertError = null;
  postPack = "b2b";
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

  it("refuses a client of company B with the publish right sending company A's piece, and records nothing", async () => {
    user = { id: "u-b", role: "client", company_id: "c2", can_publish: true };
    const res = await POST(req({ pieceId: "p1" }));
    expect(res.status).toBe(401);
    expect(inserted).toHaveLength(0);
  });

  it("answers a repeat that slips past the check (unique index, error 23505) with a plain 409", async () => {
    insertError = { message: 'duplicate key value violates unique constraint "publishing_jobs_newsletter_published_uniq"', code: "23505" };
    const res = await POST(req({ pieceId: "p1" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("This article is already marked as published.");
    expect(JSON.stringify(json)).not.toContain("duplicate key");
  });

  it("does not leak a database error message on any other failure", async () => {
    insertError = { message: "connection reset by peer", code: "08006" };
    const res = await POST(req({ pieceId: "p1" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("connection reset");
  });

  it("is refused for a hospitality venue's own people, but not for the operator", async () => {
    postPack = "hospitality";
    user = { id: "u2", role: "client", company_id: "c1", can_publish: true };
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(403);
    expect(inserted).toHaveLength(0);
    user = { id: "u-michael", role: "admin", company_id: null };
    expect((await POST(req({ pieceId: "p1" }))).status).toBe(200);
  });
});
