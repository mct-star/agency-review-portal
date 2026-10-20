import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: { role: "client", company_id: "company-a", can_publish: true } as Record<string, unknown> | null, queries: [] as { table: string; column: string; value: unknown }[], mediaError: false, truncated: false }));
vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) => companyId === "company-a" ? mocks.user : null,
  createAdminSupabaseClient: async () => ({ from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "order", "not"]) query[method] = () => query;
    for (const method of ["eq", "in"]) query[method] = (column: string, value: unknown) => { mocks.queries.push({ table, column, value }); return query; };
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      error: mocks.mediaError && table === "content_assets" ? { message: "Unavailable" } : null,
      count: table === "content_assets" ? 0 : table === "content_images" && mocks.truncated ? 2 : 1,
      data: table === "content_pieces" ? [{ id: "piece-a", title: "Approved post", content_type: "social_post", approval_status: "approved", week_id: null, markdown_body: "**An approved post** #tag", first_comment: "A comment", cover_image_url: null }]
        : table === "content_images" ? [{ content_piece_id: "piece-a", public_url: "https://example.supabase.co/storage/v1/object/public/media/photo.jpg", filename: "photo.jpg", sort_order: 0 }] : [],
    }).then(resolve);
    return query;
  } }),
}));

import { GET } from "./route";
beforeEach(() => { mocks.user = { role: "client", company_id: "company-a", can_publish: true }; mocks.queries = []; mocks.mediaError = false; mocks.truncated = false; });

describe("approved publishing preview", () => {
  it("authorises the company before reading and follows only its approved media ids", async () => {
    const response = await GET(new Request("https://portal.example/api/publish/approved?companyId=company-a"));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data[0].preview).toEqual({ linkedin: "An approved post", meta: "An approved post #tag", social: "An approved post #tag", firstComment: "A comment" });
    expect(data[0].media.shape).toBe("image");
    expect(data[0]).not.toHaveProperty("markdown_body");
    expect(mocks.queries).toContainEqual({ table: "content_pieces", column: "company_id", value: "company-a" });
    expect(mocks.queries).toContainEqual({ table: "content_pieces", column: "approval_status", value: "approved" });
    expect(mocks.queries).toContainEqual({ table: "content_assets", column: "content_piece_id", value: ["piece-a"] });
  });
  it("refuses cross-company and nonpublisher reads without querying content", async () => {
    expect((await GET(new Request("https://portal.example/api/publish/approved?companyId=company-b"))).status).toBe(401);
    mocks.user = { role: "client", can_publish: false };
    expect((await GET(new Request("https://portal.example/api/publish/approved?companyId=company-a"))).status).toBe(403);
    expect(mocks.queries).toEqual([]);
  });
  it("fails visibly when approved media cannot be loaded rather than previewing a text-only post", async () => {
    mocks.mediaError = true;
    expect((await GET(new Request("https://portal.example/api/publish/approved?companyId=company-a"))).status).toBe(500);
  });
  it("refuses an incomplete media read so confirmation cannot silently omit an image", async () => {
    mocks.truncated = true;
    expect((await GET(new Request("https://portal.example/api/publish/approved?companyId=company-a"))).status).toBe(503);
  });
});
