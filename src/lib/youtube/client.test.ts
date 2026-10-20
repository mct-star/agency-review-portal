import { afterEach, describe, expect, it, vi } from "vitest";
import { exactYouTubeChannel, getYouTubeAuthorizationUrl, isPortalVideoUrl, listMyYouTubeChannels, refreshYouTubeToken, YOUTUBE_SCOPES } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("YouTube OAuth and channel client", () => {
  it("requests offline upload permission and read access only", () => {
    const url = new URL(getYouTubeAuthorizationUrl("client", "https://portal.test/callback", "signed-state"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...YOUTUBE_SCOPES]);
    expect(url.searchParams.get("scope")).not.toContain("youtube.force-ssl");
  });

  it("preserves Google's refresh token when rotating access credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const tokens = await refreshYouTubeToken("old-refresh", "client", "secret");
    expect(tokens.accessToken).toBe("new-access");
    expect(tokens.refreshToken).toBe("old-refresh");
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get("refresh_token")).toBe("old-refresh");
  });

  it("reads channel identity from Google and refuses URLs outside the public content library", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { id: "UC123456", snippet: { title: "Exact channel", customUrl: "@exact", thumbnails: { default: { url: "https://img.test/thumb.jpg" } } } },
    ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listMyYouTubeChannels("access")).resolves.toEqual([
      { id: "UC123456", title: "Exact channel", customUrl: "@exact", thumbnail: "https://img.test/thumb.jpg" },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain("mine=true");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer access");
    expect(isPortalVideoUrl("https://project.supabase.co/storage/v1/object/public/content-assets/company/clip.mp4", "https://project.supabase.co")).toBe(true);
    expect(isPortalVideoUrl("https://attacker.test/storage/v1/object/public/content-assets/company/clip.mp4", "https://project.supabase.co")).toBe(false);
    expect(isPortalVideoUrl("https://project.supabase.co/storage/v1/object/sign/captures/clip.mp4", "https://project.supabase.co")).toBe(false);
    expect(exactYouTubeChannel([{ id: "one", title: "One", customUrl: null, thumbnail: null }], "one")?.id).toBe("one");
    expect(exactYouTubeChannel([
      { id: "one", title: "One", customUrl: null, thumbnail: null },
      { id: "two", title: "Two", customUrl: null, thumbnail: null },
    ])).toBeNull();
    expect(exactYouTubeChannel([{ id: "one", title: "One", customUrl: null, thumbnail: null }], "other")).toBeNull();
  });
});
