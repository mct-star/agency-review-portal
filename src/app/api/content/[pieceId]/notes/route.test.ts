import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state: { user: Record<string, unknown> | null; supabase: ReturnType<typeof fakeSupabase> } = {
  user: null,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => state.user,
  createAdminSupabaseClient: async () => state.supabase.client,
}));

import { DELETE, GET, POST } from "./route";

const params = { params: Promise.resolve({ pieceId: "p1" }) };
const post = (body: Record<string, unknown>) =>
  new Request("http://x/api/content/p1/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A };
});

describe("review notes route", () => {
  it("refuses a piece from another company", async () => {
    state.supabase = fakeSupabase({ content_pieces: { data: { id: "p1", company_id: B } } });
    expect((await GET(new Request("http://x"), params)).status).toBe(404);
    expect((await POST(post({ body: "x" }), params)).status).toBe(404);
    expect(state.supabase.calls.some((c) => c.table === "review_notes")).toBe(false);
  });

  it("refuses a caller who is not signed in", async () => {
    state.user = null;
    expect((await GET(new Request("http://x"), params)).status).toBe(401);
  });

  it("saves a note against the paragraph, scoped to the piece's company", async () => {
    state.supabase = fakeSupabase({
      content_pieces: { data: { id: "p1", company_id: A } },
      review_notes: { data: { id: "n1", body: "Cut this." } },
    });
    const res = await POST(post({ body: "  Cut this.  ", paragraphIndex: 3, paragraphQuote: "Most launches fail..." }), params);
    expect(res.status).toBe(201);
    const insert = state.supabase.calls.find((c) => c.table === "review_notes" && c.method === "insert");
    expect(insert?.args[0]).toEqual({
      content_piece_id: "p1", company_id: A, user_id: "u-a",
      paragraph_index: 3, paragraph_quote: "Most launches fail...", body: "Cut this.",
    });
  });

  it("stores a note with no paragraph on the whole piece", async () => {
    state.supabase = fakeSupabase({
      content_pieces: { data: { id: "p1", company_id: A } },
      review_notes: { data: { id: "n1" } },
    });
    await POST(post({ body: "Overall too long.", paragraphIndex: -1, paragraphQuote: "ignored" }), params);
    const insert = state.supabase.calls.find((c) => c.table === "review_notes" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ paragraph_index: null, paragraph_quote: null });
  });

  it("rejects an empty note", async () => {
    state.supabase = fakeSupabase({ content_pieces: { data: { id: "p1", company_id: A } } });
    expect((await POST(post({ body: "   " }), params)).status).toBe(400);
  });

  it("lets a client remove only their own note", async () => {
    state.supabase = fakeSupabase({ content_pieces: { data: { id: "p1", company_id: A } } });
    const res = await DELETE(new Request("http://x/api/content/p1/notes?noteId=n1", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    const eqs = state.supabase.calls.filter((c) => c.table === "review_notes" && c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["company_id", A]);
    expect(eqs).toContainEqual(["user_id", "u-a"]);
  });
});
