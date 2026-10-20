import { afterEach, describe, expect, it, vi } from "vitest";
import { threadsDirectAdapter } from "./direct";

describe("Threads token refresh", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the current long-lived token as the documented access_token query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "refreshed-token", expires_in: 5184000 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const result = await threadsDirectAdapter.refreshIfNeeded({
      account: { id: "account", companyId: "company", platform: "threads", accountId: "identity", accountName: "name", platformMetadata: null, isActive: true },
      credentials: { accessToken: "current-token", refreshToken: null, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() },
      text: "", title: null, media: null, options: {}, signal,
    });

    const [request, init] = fetchMock.mock.calls[0];
    const url = new URL(request as string);
    expect(url.pathname).toBe("/refresh_access_token");
    expect(url.searchParams.get("grant_type")).toBe("th_refresh_token");
    expect(url.searchParams.get("access_token")).toBe("current-token");
    expect(init?.headers).toBeUndefined();
    expect(result).toMatchObject({ kind: "refreshed", credentials: { accessToken: "refreshed-token", refreshToken: null } });
  });
});
