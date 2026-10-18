import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  inserts: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: vi.fn(async (companyId: string) => state.profile?.company_id === companyId || state.profile?.role === "admin" ? state.profile : null),
  createAdminSupabaseClient: async () => ({ from: (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let inserted: Record<string, unknown> | null = null;
    let patch: Record<string, unknown> | null = null;
    let error: { code: string } | null = null;
    const chain: Record<string, any> = {};
    const result = () => {
      const rows = (state.tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
      if (patch) rows.forEach((row) => Object.assign(row, patch));
      return { data: rows, error };
    };
    chain.select = () => chain;
    chain.not = () => chain;
    chain.eq = (key: string, value: unknown) => {
      filters.push((row) => key === "platform_metadata->>page_id" ? (row.platform_metadata as { page_id?: string })?.page_id === value : row[key] === value);
      return chain;
    };
    chain.in = (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return chain; };
    chain.update = (value: Record<string, unknown>) => { patch = value; return chain; };
    chain.insert = (row: Record<string, unknown>) => {
      state.inserts.push(row);
      if ((state.tables[table] || []).some((old) => old.id === row.id)) error = { code: "23505" };
      else { inserted = row; state.tables[table] = [...(state.tables[table] || []), row]; }
      return chain;
    };
    chain.maybeSingle = async () => ({ data: inserted || result().data[0] || null, error });
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve);
    return chain;
  } }),
}));
import { DELETE, GET, POST } from "./route";

const input = (extra: Record<string, unknown> = {}) => ({ companyId: "company-1", pieceId: "piece-1", socialAccountId: "account-1", platform: "facebook", ...extra });
const request = (body: unknown, method = "POST") => new Request("https://portal.example/api/publish/meta", { method, body: JSON.stringify(body) });
beforeEach(() => {
  state.profile = { id: "user-1", role: "client", company_id: "company-1", can_publish: true };
  state.inserts = [];
  state.tables = {
    content_pieces: [{ id: "piece-1", company_id: "company-1", content_type: "social_post", approval_status: "approved", markdown_body: "Approved #Launch", cover_image_url: null }],
    company_social_accounts: [{ id: "account-1", company_id: "company-1", platform: "facebook", account_id: "page-1", account_name: "Selected Page", is_active: true, access_token_encrypted: "encrypted-private-token", token_expires_at: null, platform_metadata: { page_id: "page-1" } }],
    companies: [{ id: "company-1", social_networks: ["facebook", "instagram"] }],
    publishing_jobs: [], content_images: [], content_assets: [],
  };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://meta-test.supabase.co");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("company Meta publishing API", () => {
  it("queues the approved copy for the explicitly selected Page and time", async () => {
    const scheduledFor = new Date(Date.now() + 3_600_000).toISOString();
    expect((await POST(request(input({ scheduledFor })))).status).toBe(201);
    expect(state.inserts[0]).toMatchObject({ company_id: "company-1", social_account_id: "account-1", target_platform: "facebook", status: "scheduled", scheduled_for: scheduledFor, publish_payload: { caption: "Approved #Launch" } });
    expect(JSON.stringify(state.inserts)).not.toContain("encrypted-private-token");
  });

  it("refuses duplicate jobs, including a failed job with an uncertain outcome", async () => {
    expect((await POST(request(input()))).status).toBe(201);
    Object.assign(state.tables.publishing_jobs[0], { status: "failed", response_payload: { outcome_uncertain: true } });
    expect((await POST(request(input()))).status).toBe(409);
    expect(state.tables.publishing_jobs).toHaveLength(1);
  });

  const cases: Array<[string, () => void, number]> = [
    ["another tenant", () => { state.profile!.company_id = "company-2"; }, 401],
    ["revoked permission", () => { state.profile!.can_publish = false; }, 403],
    ["unapproved copy", () => { state.tables.content_pieces[0].approval_status = "pending"; }, 400],
    ["a post from another tenant", () => { state.tables.content_pieces[0].company_id = "company-2"; }, 400],
    ["an account from another tenant", () => { state.tables.company_social_accounts[0].company_id = "company-2"; }, 404],
    ["a disconnected account", () => { state.tables.company_social_accounts[0].is_active = false; }, 404],
    ["an expired token", () => { state.tables.company_social_accounts[0].token_expires_at = "2020-01-01"; }, 404],
    ["an invalid token expiry", () => { state.tables.company_social_accounts[0].token_expires_at = "invalid"; }, 404],
    ["a disabled network", () => { state.tables.companies[0].social_networks = []; }, 403],
  ];
  it.each(cases)("refuses %s before creating a job", async (_label, change, status) => {
    change();
    expect((await POST(request(input()))).status).toBe(status);
    expect(state.inserts).toHaveLength(0);
  });

  it("requires a photo for Instagram", async () => {
    Object.assign(state.tables.company_social_accounts[0], { platform: "instagram", account_id: "ig-1" });
    expect((await POST(request(input({ platform: "instagram" })))).status).toBe(422);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a non-public or external image URL", async () => {
    state.tables.content_pieces[0].cover_image_url = "https://external.example/photo.jpg";
    expect((await POST(request(input()))).status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it("returns safe account metadata without credentials", async () => {
    const response = await GET(new Request("https://portal.example/api/publish/meta?companyId=company-1"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("Selected Page");
    expect(body).not.toContain("encrypted-private-token");
    expect(body).not.toContain("access_token");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("disconnects the linked pair in this company and preserves another tenant's connection", async () => {
    state.tables.company_social_accounts.push(
      { ...state.tables.company_social_accounts[0], id: "ig-connection", platform: "instagram", account_id: "ig-1" },
      { ...state.tables.company_social_accounts[0], id: "other-tenant", company_id: "company-2" },
    );
    expect((await DELETE(request(input(), "DELETE"))).status).toBe(200);
    expect(state.tables.company_social_accounts.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "account-1", is_active: false, access_token_encrypted: null }),
      expect.objectContaining({ id: "ig-connection", is_active: false, access_token_encrypted: null }),
    ]));
    expect(state.tables.company_social_accounts[2].access_token_encrypted).toBe("encrypted-private-token");
  });

  it("rejects malformed input and invalid schedules", async () => {
    expect((await POST(new Request("https://portal.example/api/publish/meta", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request(input({ scheduledFor: "invalid" })))).status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });
});
