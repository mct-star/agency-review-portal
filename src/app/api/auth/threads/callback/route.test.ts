import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreadsState, ThreadsApiError } from "@/lib/threads/oauth";

const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), nonce: "browser-nonce" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.nonce }) }) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => ({ id: "user-a", role: "admin" }),
  requireCompanyUser: async () => ({ id: "user-a", role: "admin" }),
  createAdminSupabaseClient: async () => ({ from: () => ({ upsert: mocks.save }) }),
}));
vi.mock("@/lib/crypto", () => ({ encrypt: () => "encrypted-grant" }));
vi.mock("@/lib/threads/oauth", async (original) => ({ ...await original<object>(), threadsRequest: mocks.request }));

import { GET } from "./route";

describe("Threads callback grant validation", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnings: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubEnv("THREADS_APP_ID", "app-id");
    vi.stubEnv("THREADS_APP_SECRET", "private-app-secret");
    vi.stubEnv("THREADS_REDIRECT_URI", "https://portal.test/api/auth/threads/callback");
    mocks.save.mockReset().mockResolvedValue({ error: null });
    mocks.request.mockReset().mockResolvedValueOnce({ id: "thread-user", username: "michael" }).mockResolvedValueOnce({ data: [] });
    fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "private-short-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "private-long-token", expires_in: 5184000 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function callback() {
    const state = createThreadsState({ companyId: "company-a", userId: "user-a", nonce: mocks.nonce }, "private-app-secret");
    return GET(new Request(`https://portal.test/api/auth/threads/callback?code=private-code&state=${encodeURIComponent(state)}`));
  }

  it("saves an encrypted grant only after identity and publishing permission checks", async () => {
    const response = await callback();
    expect(mocks.request.mock.calls.map(([path]) => path)).toEqual(["me", "me/threads_publishing_limit"]);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company-a", account_id: "thread-user", access_token_encrypted: "encrypted-grant" }), expect.anything());
    expect(response.headers.get("location")).toContain("threads_connected=1");
  });

  it("reports the token exchange stage without logging a code or secret", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "private-code private-app-secret" } }), { status: 400 }));
    const response = await callback();
    expect(response.headers.get("location")).toContain("threads_error=token_exchange_failed");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(warnings).toHaveBeenCalledWith("[Threads OAuth] connection failed", { step: "token_exchange_failed", httpStatus: 400 });
    expect(JSON.stringify(warnings.mock.calls)).not.toContain("private-");
  });

  it("refuses a grant when publishing permission cannot be verified", async () => {
    mocks.request.mockReset().mockResolvedValueOnce({ id: "thread-user", username: "michael" }).mockRejectedValueOnce(new ThreadsApiError(403));
    const response = await callback();
    expect(response.headers.get("location")).toContain("threads_error=publishing_permission_failed");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(JSON.stringify(warnings.mock.calls)).not.toContain("private-");
  });
});
