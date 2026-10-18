import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ requireAdmin: vi.fn(async () => ({ id: "admin-1" })), createAdminSupabaseClient: vi.fn() }));
vi.mock("@/lib/providers", () => ({ resolveProvider: state.resolve }));

import { POST } from "./route";

describe("legacy video publishing route", () => {
  beforeEach(() => state.resolve.mockReset());

  it.each(["youtube", "youtube_shorts"])("refuses the legacy %s upload path", async (targetPlatform) => {
    const request = new Request("http://localhost/api/publish/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentPieceId: "piece-1", targetPlatform, videoUrl: "https://example.test/video.mp4" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "Queue an approved rendered video for the selected YouTube channel." });
    expect(state.resolve).not.toHaveBeenCalled();
  });
});
