import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlueskyOAuthState } from "@/lib/bluesky/oauth";

const mock = vi.hoisted(() => ({
  nonce: "nonce-a",
  profile: { id: "admin-a", role: "admin", company_id: null } as Record<string, unknown>,
  pending: null as { company_id: string; user_id: string; encrypted_value: string; expires_at: string } | null,
  client: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mock.nonce }) }) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => mock.profile,
  requireCompanyUser: async (companyId: string) => companyId === "company-a" ? mock.profile : null,
  createAdminSupabaseClient: async () => ({ from: () => {
    let valid = false;
    const chain = { select: () => chain, eq: (_field: string, value: string) => { valid = value === "sdk-state"; return chain; }, maybeSingle: async () => ({ data: valid ? mock.pending : null }) };
    return chain;
  } }),
}));
vi.mock("@/lib/crypto", () => ({ decrypt: (value: string) => value, encrypt: (value: string) => value }));
vi.mock("@/lib/bluesky/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bluesky/oauth")>();
  return { ...actual, blueskyOAuthConfig: () => ({ configured: true }), createBlueskyOAuthClient: mock.client };
});
import { GET } from "./route";

function prepare(returnTo: "setup" | "publish" = "setup") {
  const appState = createBlueskyOAuthState({ companyId: "company-a", userId: "admin-a", nonce: "nonce-a", returnTo });
  mock.pending = { company_id: "company-a", user_id: "admin-a", encrypted_value: JSON.stringify({ appState }), expires_at: new Date(Date.now() + 60_000).toISOString() };
}

describe("Bluesky callback return continuity", () => {
  beforeEach(() => {
    vi.stubEnv("BLUESKY_OAUTH_PRIVATE_JWK", "test-state-key");
    mock.nonce = "nonce-a";
    mock.profile = { id: "admin-a", role: "admin", company_id: null };
    mock.client.mockReset(); prepare();
  });
  afterEach(() => vi.unstubAllEnvs());
  it("verifies durable signed state before returning a provider cancellation to company Settings", async () => {
    const response = await GET(new Request("https://portal.example/api/auth/bluesky/callback?state=sdk-state&error=access_denied"));
    expect(response.headers.get("location")).toBe("https://portal.example/setup/company-a/social?bluesky_error=grant_cancelled");
    expect(mock.client).not.toHaveBeenCalled();
  });
  it("preserves an explicitly signed publishing target on cancellation", async () => {
    prepare("publish");
    const response = await GET(new Request("https://portal.example/api/auth/bluesky/callback?state=sdk-state&error=access_denied"));
    expect(response.headers.get("location")).toBe("https://portal.example/publish?bluesky_error=grant_cancelled&companyId=company-a");
  });
  it("refuses a wrong browser nonce before trusting a company return destination", async () => {
    mock.nonce = "another-browser";
    const response = await GET(new Request("https://portal.example/api/auth/bluesky/callback?state=sdk-state&error=access_denied"));
    expect(response.headers.get("location")).toBe("https://portal.example/publish?bluesky_error=invalid_state");
    expect(mock.client).not.toHaveBeenCalled();
  });
});
