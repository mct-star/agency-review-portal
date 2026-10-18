import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signYouTubeOAuthState } from "@/lib/youtube/oauth-state";

const mocks = vi.hoisted(() => ({
  nonce: "nonce-abcdefghijklmnopqrstuvwxyz012345",
  profile: { id: "user-a", role: "client", company_id: "company-a", can_publish: true },
  exchange: vi.fn(),
  listChannels: vi.fn(),
  save: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.nonce }) }) }));
vi.mock("@/lib/hospitality/pack-guard", () => ({ refuseHospitality: async () => null }));
vi.mock("@/lib/youtube/client", () => ({
  YOUTUBE_SCOPES: ["youtube.upload", "youtube.readonly"],
  exchangeYouTubeCode: mocks.exchange,
  listMyYouTubeChannels: mocks.listChannels,
  exactYouTubeChannel: (channels: Array<{ id: string }>) => channels.length === 1 ? channels[0] : null,
}));
vi.mock("@/lib/youtube/oauth", () => ({
  YOUTUBE_NONCE_COOKIE: "youtube_oauth_nonce",
  canManageYouTube: async () => ({ profile: mocks.profile, reason: null }),
  saveYouTubeAccount: mocks.save,
}));

import { GET } from "./route";

describe("YouTube OAuth callback", () => {
  beforeEach(() => {
    process.env.YOUTUBE_STATE_SECRET = "test-state-secret";
    process.env.YOUTUBE_CLIENT_ID = "client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "client-secret";
    process.env.YOUTUBE_REDIRECT_URI = "https://portal.example/api/auth/youtube/callback";
    process.env.NEXT_PUBLIC_APP_URL = "https://portal.example";
    mocks.nonce = "nonce-abcdefghijklmnopqrstuvwxyz012345";
    mocks.profile = { id: "user-a", role: "client", company_id: "company-a", can_publish: true };
    mocks.exchange.mockReset().mockResolvedValue({ accessToken: "secret-access", refreshToken: "secret-refresh", expiresAt: new Date().toISOString(), scope: "youtube.upload youtube.readonly" });
    mocks.listChannels.mockReset();
    mocks.save.mockReset().mockResolvedValue({ id: "row-a", accountId: "UC123456", accountName: "Exact channel" });
  });

  afterEach(() => {
    delete process.env.YOUTUBE_STATE_SECRET;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.YOUTUBE_REDIRECT_URI;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  async function callback(channels: Array<{ id: string; title: string }>) {
    mocks.listChannels.mockResolvedValue(channels);
    const state = await signYouTubeOAuthState({ companyId: "company-a", userId: "user-a", returnTo: "publish", nonce: mocks.nonce }, "test-state-secret");
    return GET(new Request(`https://portal.example/api/auth/youtube/callback?code=google-code&state=${encodeURIComponent(state)}`));
  }

  it("saves only a single effective channel and returns to the same company", async () => {
    const channel = { id: "UC123456", title: "Exact channel" };
    const response = await callback([channel]);
    expect(mocks.save).toHaveBeenCalledWith("company-a", expect.objectContaining({ accessToken: "secret-access" }), channel);
    expect(response.headers.get("location")).toBe("https://portal.example/publish?youtube_connected=1&companyId=company-a");
  });

  it("fails closed when the grant exposes multiple channels", async () => {
    const response = await callback([{ id: "UC123456", title: "Channel one" }, { id: "UC654321", title: "Channel two" }]);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://portal.example/publish?youtube_error=ambiguous_channel&companyId=company-a");
  });
});
