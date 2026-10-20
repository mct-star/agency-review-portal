import { afterEach, describe, expect, it, vi } from "vitest";
import { youtubeAdapter } from "./direct-publish";

const input = {
  account: { id: "account-1", companyId: "company-1", platform: "youtube" as const, accountId: "UC123456", accountName: "Exact channel", platformMetadata: {}, isActive: true },
  credentials: { accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  text: "Approved description",
  title: "Approved title",
  media: { url: "https://project.supabase.co/storage/v1/object/public/content-assets/company/video.mp4", kind: "video" as const, mimeType: "video/mp4" },
  options: { privacy: "unlisted", madeForKids: false },
  signal: new AbortController().signal,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("YouTube approved queue adapter", () => {
  it("requires explicit privacy and made-for-kids options before making provider calls", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(youtubeAdapter.publish({ ...input, options: { privacy: "unlisted" } })).resolves.toMatchObject({ kind: "not-published" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams the approved portal video with explicit status metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "UC123456", snippet: { title: "Exact channel" } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" }).stream(), { status: 200, headers: { "content-length": "5", "content-type": "video/mp4" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=upload123" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "YouTube123" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(youtubeAdapter.publish(input)).resolves.toEqual({
      kind: "published", externalId: "YouTube123", externalUrl: "https://www.youtube.com/watch?v=YouTube123",
    });
    const initBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(initBody).toEqual({
      snippet: { title: "Approved title", description: "Approved description" },
      status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
    });
    expect(fetchMock.mock.calls[3][1].body).toBeInstanceOf(ReadableStream);
    expect(fetchMock.mock.calls[3][1].headers["Content-Length"]).toBe("5");
  });

  it("rejects a provider session URL outside Google's YouTube upload host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "UC123456", snippet: { title: "Exact channel" } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" }).stream(), { status: 200, headers: { "content-length": "5", "content-type": "video/mp4" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: "https://attacker.test/upload?upload_id=x" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(youtubeAdapter.publish(input)).resolves.toMatchObject({ kind: "not-published" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("marks a lost upload response as uncertain so the worker will not retry automatically", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "UC123456", snippet: { title: "Exact channel" } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" }).stream(), { status: 200, headers: { "content-length": "5", "content-type": "video/mp4" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=upload123" } }))
      .mockRejectedValueOnce(new Error("network reset"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(youtubeAdapter.publish(input)).resolves.toMatchObject({ kind: "uncertain" });
  });

  it("refuses to upload when Google exposes multiple possible channels", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { id: "UC123456", snippet: { title: "Exact channel" } },
      { id: "UC654321", snippet: { title: "Other channel" } },
    ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(youtubeAdapter.publish(input)).resolves.toMatchObject({ kind: "not-published" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
