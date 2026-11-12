import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/constants/week-board", () => ({ isWeekBoardEnabled: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: async () => ({ id: "admin" }),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      if (table === "content_pieces") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "piece-a", company_id: "company-a", week_id: "week-a" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "content_assets") {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.filter = () => q;
        q.order = () => q;
        q.limit = async () => ({
          data: [{ id: "asset-a", storage_path: "p/clip.mov", asset_metadata: { bucket: "captures" } }],
          error: null,
        });
        return q;
      }
      return {
        insert: (row: Record<string, unknown>) => {
          state.inserted = row;
          return { select: () => ({ single: async () => ({ data: { id: "job-a", status: "queued" }, error: null }) }) };
        },
      };
    },
  }),
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("https://platform.test/api/admin/clips/run", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const payload = () => state.inserted?.input_payload as Record<string, unknown>;

beforeEach(() => {
  state.inserted = null;
});

describe("POST /api/admin/clips/run caption_style", () => {
  it.each(["auto", "editorial", "chest"])("passes %s in input_payload", async (style) => {
    const res = await POST(request({ contentPieceId: "piece-a", caption_style: style }));
    expect(res.status).toBe(201);
    expect(payload().caption_style).toBe(style);
    expect(payload()).not.toHaveProperty("captionStyle");
  });

  it("leaves the payload as today when no value is sent", async () => {
    const res = await POST(request({ contentPieceId: "piece-a" }));
    expect(res.status).toBe(201);
    expect(payload()).toEqual({
      preset: "phone_clip_v1",
      aspects: ["9x16"],
      variant: "clean",
      source: { bucket: "captures", path: "p/clip.mov" },
      sourceAssetId: "asset-a",
    });
  });

  it.each(["Editorial", "bold", "", 3, null])("returns 400 for %j and queues nothing", async (style) => {
    const res = await POST(request({ contentPieceId: "piece-a", caption_style: style }));
    expect(res.status).toBe(400);
    expect(state.inserted).toBeNull();
  });

  it("returns 400 for camelCase captionStyle rather than ignoring it", async () => {
    const res = await POST(request({ contentPieceId: "piece-a", captionStyle: "chest" }));
    expect(res.status).toBe(400);
    expect(state.inserted).toBeNull();
  });

  it("checks contentPieceId before caption_style", async () => {
    const res = await POST(request({ caption_style: "bold" }));
    expect((await res.json()).error).toBe("contentPieceId is required");
  });
});
