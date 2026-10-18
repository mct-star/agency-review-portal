import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ graph: vi.fn(), profile: { id: "user-a", role: "client", company_id: "company-a", can_publish: true }, upsert: vi.fn(), stored: "" }));
const previousEnv = { id: process.env.META_APP_ID, secret: process.env.META_APP_SECRET, version: process.env.META_GRAPH_API_VERSION, uri: process.env.META_REDIRECT_URI };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "cookie-ciphertext" }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSignedInProfile: async () => mock.profile, requireCompanyUser: async (id: string) => id === "company-a" ? mock.profile : null,
  createAdminSupabaseClient: async () => ({ from: () => ({ upsert: mock.upsert }) }) }));
vi.mock("@/lib/crypto", () => ({ decryptJson: () => ({ companyId: "company-a", userId: "user-a", accessToken: "user-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), grantExpiresAt: Date.now() + 60_000, nonce: "nonce-a" }), encrypt: (value: string) => { mock.stored = value; return "ciphertext"; } }));
vi.mock("@/lib/meta/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/oauth")>();
  return { ...actual, metaGraph: mock.graph };
});

import { POST } from "./route";

describe("Meta Page selection", () => {
  beforeEach(() => {
    mock.profile = { id: "user-a", role: "client", company_id: "company-a", can_publish: true };
    mock.upsert.mockReset().mockResolvedValue({ error: null }); mock.graph.mockReset(); mock.stored = "";
  });
  afterEach(() => {
    if (previousEnv.id === undefined) delete process.env.META_APP_ID; else process.env.META_APP_ID = previousEnv.id;
    if (previousEnv.secret === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = previousEnv.secret;
    if (previousEnv.version === undefined) delete process.env.META_GRAPH_API_VERSION; else process.env.META_GRAPH_API_VERSION = previousEnv.version;
    if (previousEnv.uri === undefined) delete process.env.META_REDIRECT_URI; else process.env.META_REDIRECT_URI = previousEnv.uri;
  });

  it("rejects company switching before reading or storing a grant", async () => {
    const response = await POST(new Request("https://portal.example/api/auth/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: "company-b", pageId: "page-b" }) }));
    expect(response.status).toBe(403);
    expect(mock.graph).not.toHaveBeenCalled();
    expect(mock.upsert).not.toHaveBeenCalled();
  });

  it("stores encrypted tokens only for the explicitly selected Page and its linked Instagram", async () => {
    mock.graph.mockImplementation(async (path: string) => {
      if (path === "me/accounts") return { data: [
        { id: "page-a", name: "Page A", access_token: "page-token-a", tasks: ["CREATE_CONTENT"], instagram_business_account: { id: "ig-a", username: "account_a" } },
        { id: "page-b", name: "Page B", access_token: "page-token-b", tasks: ["CREATE_CONTENT"], instagram_business_account: { id: "ig-b", username: "account_b" } },
      ] };
      if (path === "me/permissions") return { data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"].map((permission) => ({ permission, status: "granted" })) };
      if (path === "debug_token") return { data: { is_valid: true, app_id: "app-a", expires_at: 0, data_access_expires_at: 0 } };
      if (path === "page-b") return { id: "page-b", name: "Page B" };
      throw new Error("Unexpected Graph request");
    });
    process.env.META_APP_ID = "app-a"; process.env.META_APP_SECRET = "test-meta-secret"; process.env.META_GRAPH_API_VERSION = "v99.0"; process.env.META_REDIRECT_URI = "https://portal.example/api/auth/meta/callback";
    const response = await POST(new Request("https://portal.example/api/auth/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: "company-a", pageId: "page-b", instagramId: "ig-b" }) }));
    expect(response.status).toBe(200);
    expect(mock.upsert).toHaveBeenCalledTimes(1);
    const saved = mock.upsert.mock.calls[0][0] as Array<{ company_id: string; platform: string; account_id: string; access_token_encrypted: string }>;
    expect(saved.map((row) => [row.company_id, row.platform, row.account_id])).toEqual([["company-a", "facebook", "page-b"], ["company-a", "instagram", "ig-b"]]);
    expect(saved.every((row) => row.access_token_encrypted === "ciphertext")).toBe(true);
    expect(mock.stored).toBe("page-token-b");
  });

  it("rejects an Instagram identity from another Page", async () => {
    mock.graph.mockResolvedValue({ data: [{ id: "page-a", name: "Page A", access_token: "page-token-a", tasks: ["CREATE_CONTENT"], instagram_business_account: { id: "ig-a" } }] });
    const response = await POST(new Request("https://portal.example/api/auth/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: "company-a", pageId: "page-a", instagramId: "ig-b" }) }));
    expect(response.status).toBe(403);
    expect(mock.upsert).not.toHaveBeenCalled();
  });
});
