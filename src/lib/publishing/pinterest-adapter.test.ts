import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPinterestIdentity: vi.fn(),
  listPinterestBoards: vi.fn(),
  pinterestClientId: vi.fn(() => "client"),
  pinterestClientSecret: vi.fn(() => "secret"),
  refreshPinterestGrant: vi.fn(),
}));

vi.mock("@/lib/pinterest/oauth", () => mocks);
vi.mock("@/lib/media/our-storage-url", () => ({ isOurStorageUrl: (url: string) => url.startsWith("https://storage.example/") }));

import { pinterestAdapter } from "@/lib/publishing/pinterest-adapter";
import type { DirectSocialPublishInput } from "@/lib/publishing/direct-social";

const input = (boardId = "board-1"): DirectSocialPublishInput => ({
  account: { id: "row", companyId: "company", platform: "pinterest", accountId: "agency", accountName: "agency", platformMetadata: null, isActive: true },
  credentials: { accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  text: "Approved description",
  title: "Approved title",
  media: { url: "https://storage.example/storage/v1/object/public/media/image.jpg", kind: "image", mimeType: "image/jpeg" },
  options: { boardId, link: "https://agency.example/page" },
  signal: new AbortController().signal,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Pinterest direct publishing adapter", () => {
  it("creates an image Pin only on a board available to the verified account", async () => {
    mocks.getPinterestIdentity.mockResolvedValue({ username: "agency", accountType: "business", profileImage: null });
    mocks.listPinterestBoards.mockResolvedValue([{ id: "board-1", name: "News", privacy: "PUBLIC" }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/jpeg", "content-length": "2" } }))
      .mockResolvedValueOnce(Response.json({ id: "pin-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pinterestAdapter.publish(input());

    expect(result).toEqual({ kind: "published", externalId: "pin-1" });
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.pinterest.com/v5/pins");
    expect(JSON.parse(String(request.body))).toEqual({
      board_id: "board-1",
      title: "Approved title",
      description: "Approved description",
      link: "https://agency.example/page",
      media_source: { source_type: "image_url", url: "https://storage.example/storage/v1/object/public/media/image.jpg", is_standard: true },
    });
  });

  it("refuses a board outside the connected account before creating a Pin", async () => {
    mocks.getPinterestIdentity.mockResolvedValue({ username: "agency", accountType: "business", profileImage: null });
    mocks.listPinterestBoards.mockResolvedValue([{ id: "other-board", name: "Other", privacy: "PUBLIC" }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/jpeg", "content-length": "2" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pinterestAdapter.publish(input());

    expect(result).toMatchObject({ kind: "not-published" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
