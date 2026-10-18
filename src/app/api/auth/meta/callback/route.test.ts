import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMetaState } from "@/lib/meta/oauth";

const mock = vi.hoisted(() => ({ profile: { id: "user-a", role: "client", company_id: "company-a", can_publish: true }, nonce: "nonce-a", graph: vi.fn(), encrypt: vi.fn(() => "encrypted-pending-grant") }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "meta_oauth_nonce" ? { value: mock.nonce } : undefined }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSignedInProfile: async () => mock.profile, requireCompanyUser: async (id: string) => id === "company-a" ? mock.profile : null }));
vi.mock("@/lib/crypto", () => ({ encryptJson: mock.encrypt }));
vi.mock("@/lib/meta/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/oauth")>();
  return { ...actual, metaGraph: mock.graph };
});

import { GET } from "./route";

describe("Meta OAuth callback", () => {
  const old = { secret: process.env.META_APP_SECRET, id: process.env.META_APP_ID, uri: process.env.META_REDIRECT_URI, version: process.env.META_GRAPH_API_VERSION };
  beforeEach(() => {
    process.env.META_APP_SECRET = "test-meta-secret"; process.env.META_APP_ID = "app-a";
    process.env.META_REDIRECT_URI = "https://portal.example/api/auth/meta/callback"; process.env.META_GRAPH_API_VERSION = "v99.0";
    mock.profile = { id: "user-a", role: "client", company_id: "company-a", can_publish: true };
    mock.nonce = "nonce-a"; mock.graph.mockReset(); mock.encrypt.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short-user-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long-user-token", expires_in: 5_000_000 }), { status: 200 })));
  });
  afterEach(() => {
    for (const [key, value] of Object.entries({ META_APP_SECRET: old.secret, META_APP_ID: old.id, META_REDIRECT_URI: old.uri, META_GRAPH_API_VERSION: old.version })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    vi.unstubAllGlobals();
  });

  it("rejects a tampered state before exchanging a code", async () => {
    const response = await GET(new Request("https://portal.example/api/auth/meta/callback?code=code&state=bad"));
    expect(response.headers.get("location")).toContain("meta_error=invalid_session");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a callback from another signed-in user", async () => {
    const state = createMetaState({ companyId: "company-a", userId: "user-a", nonce: "nonce-a" });
    mock.profile = { id: "user-b", role: "client", company_id: "company-b", can_publish: true };
    const response = await GET(new Request("https://portal.example/api/auth/meta/callback?code=code&state=" + encodeURIComponent(state)));
    expect(response.headers.get("location")).toContain("meta_error=invalid_session");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates Page permissions and keeps the long-lived grant encrypted in a short-lived cookie", async () => {
    const state = createMetaState({ companyId: "company-a", userId: "user-a", nonce: "nonce-a" });
    mock.graph.mockResolvedValue({ data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].map((permission) => ({ permission, status: "granted" })) });
    const response = await GET(new Request("https://portal.example/api/auth/meta/callback?code=code&state=" + encodeURIComponent(state)));
    expect(response.headers.get("location")).toContain("companyId=company-a&meta_choose_page=1");
    expect(mock.graph).toHaveBeenCalledWith("me/permissions", { fields: "permission,status" }, "long-user-token");
    expect(mock.encrypt).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-a", userId: "user-a", accessToken: "long-user-token" }));
    expect(response.headers.get("set-cookie")).toContain("encrypted-pending-grant");
    expect(response.headers.get("set-cookie")).not.toContain("long-user-token");
  });
});
