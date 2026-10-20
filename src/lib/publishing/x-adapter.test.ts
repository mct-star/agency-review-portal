import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getXIdentity: vi.fn(),
  refreshXGrant: vi.fn(),
  xClientId: vi.fn(() => "client"),
  xClientSecret: vi.fn(() => "secret"),
}));

vi.mock("@/lib/x/oauth", () => mocks);
vi.mock("@/lib/media/our-storage-url", () => ({ isOurStorageUrl: (url: string) => url.startsWith("https://storage.example/" ) }));

import { xAdapter } from "@/lib/publishing/x-adapter";
import type { DirectSocialPublishInput } from "@/lib/publishing/direct-social";

const input = (media = true): DirectSocialPublishInput => ({
  account: { id: "row", companyId: "company", platform: "twitter", accountId: "user-1", accountName: "Account", platformMetadata: null, isActive: true },
  credentials: { accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  text: "Approved post",
  title: null,
  media: media ? { url: "https://storage.example/storage/v1/object/public/media/image.png", kind: "image", mimeType: "image/png" } : null,
  options: {},
  signal: new AbortController().signal,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("X direct publishing adapter", () => {
  it("uploads one portal image then creates a post for the verified identity", async () => {
    mocks.getXIdentity.mockResolvedValue({ id: "user-1", username: "agency", name: "Agency" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png", "content-length": "3" } }))
      .mockResolvedValueOnce(Response.json({ data: { id: "media-1" } }))
      .mockResolvedValueOnce(Response.json({ data: { id: "post-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await xAdapter.publish(input());

    expect(result).toEqual({ kind: "published", externalId: "post-1", externalUrl: "https://x.com/agency/status/post-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const upload = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(upload.body))).toMatchObject({ media: "AQID", media_category: "tweet_image" });
    const post = fetchMock.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(post.body))).toEqual({ text: "Approved post", media: { media_ids: ["media-1"] } });
  });

  it("marks an unconfirmed post request as uncertain so the worker cannot retry blindly", async () => {
    mocks.getXIdentity.mockResolvedValue({ id: "user-1", username: "agency", name: "Agency" });
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await xAdapter.publish(input(false));

    expect(result.kind).toBe("uncertain");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
