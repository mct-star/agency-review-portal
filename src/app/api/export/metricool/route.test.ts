import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pieces: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/permissions", () => ({ canAccessCompany: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => ({ id: "user-1", role: "admin" }),
  createAdminSupabaseClient: async () => ({
    from(table: string) {
      const data =
        table === "weeks" ? { company_id: "co-1", date_start: "2026-10-12", week_number: 42, company: { slug: "client", social_networks: null } }
        : table === "content_pieces" ? state.pieces
        : table === "content_assets" ? state.assets
        : [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "not", "order"]) chain[method] = () => chain;
      chain.single = async () => ({ data, error: null });
      chain.then = (resolve: (value: { data: unknown }) => void) => resolve({ data });
      return chain;
    },
  }),
}));

import { GET } from "./route";

const post = (id: string, title: string) => ({ id, title, markdown_body: `${title} body`, first_comment: null, post_type: "video_clip", scheduled_date: "2026-10-14", scheduled_time: "12:00" });
const clip = (pieceId: string, thumbnailUrl?: string) => ({
  content_piece_id: pieceId,
  asset_type: "custom",
  file_url: `https://cdn.example.com/${pieceId}.mp4`,
  text_content: "Clip",
  asset_metadata: { type: "rendered_video", ...(thumbnailUrl ? { thumbnailUrl } : {}) },
});
const exportWeek = () => GET(new Request("https://portal.test/api/export/metricool?weekId=week-1"));

describe("GET /api/export/metricool", () => {
  beforeEach(() => {
    state.pieces = [];
    state.assets = [];
  });

  it("leaves a LinkedIn video with no thumbnail out of the file and names it in the notes", async () => {
    state.pieces = [post("kept", "Kept clip"), post("held", "Held clip"), post("words", "Words only")];
    state.assets = [clip("kept", "https://cdn.example.com/kept.jpg"), clip("held")];

    const res = await exportWeek();
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(csv).toContain("Kept clip body");
    expect(csv).toContain("https://cdn.example.com/kept.jpg");
    expect(csv).toContain("Words only body");
    expect(csv).not.toContain("Held clip body");
    expect(csv.trim().split("\r\n")).toHaveLength(3);
    expect(decodeURIComponent(res.headers.get("X-Export-Notes") || "")).toMatch(/Held clip is a LinkedIn video with no thumbnail/);
  });

  it("answers with the reason, not a file of headers, when every post is held back", async () => {
    state.pieces = [post("held", "Held clip")];
    state.assets = [clip("held")];

    const res = await exportWeek();

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Held clip is a LinkedIn video with no thumbnail/);
  });
});
