import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: { id: "user-1", role: "client", company_id: "company-1", can_publish: true } as Record<string, unknown> | null,
  tables: {} as Record<string, unknown>,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  media: { shape: "none", items: [] } as { shape: string; items: Array<Record<string, unknown>> },
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => state.profile?.role === "admin" ? state.profile : null),
  requireCompanyUser: vi.fn(async (companyId: string) => state.profile?.company_id === companyId || state.profile?.role === "admin" ? state.profile : null),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      let filters: Array<[string, unknown]> = [];
      let inserted: Record<string, unknown> | null = null;
      let insertError: { code: string } | null = null;
      const chain: Record<string, any> = {};
      const rows = () => {
        const source = state.tables[table];
        const data = Array.isArray(source) ? source : source ? [source] : [];
        return data.filter((row) => filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value));
      };
      chain.select = () => chain;
      chain.update = (values: Record<string, unknown>) => { state.updates.push({ table, values, filters }); return chain; };
      chain.eq = (key: string, value: unknown) => { filters.push([key, value]); return chain; };
      chain.not = () => chain;
      chain.insert = (row: Record<string, unknown>) => {
        inserted = row;
        state.inserts.push({ table, row });
        if (table === "publishing_jobs" && (state.tables.publishing_jobs as Record<string, unknown>[]).some((existing) => existing.id === row.id)) insertError = { code: "23505" };
        else state.tables[table] = [...(Array.isArray(state.tables[table]) ? state.tables[table] as unknown[] : []), row];
        return chain;
      };
      chain.maybeSingle = async () => ({ data: inserted && !insertError ? inserted : rows()[0] || null, error: insertError });
      chain.single = chain.maybeSingle;
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: rows(), error: null }).then(resolve);
      return chain;
    },
  }),
}));
vi.mock("@/lib/hospitality/pack-guard", () => ({ refuseHospitality: async () => null }));
vi.mock("@/lib/content/piece-media", () => ({ resolvePieceMedia: () => state.media }));

import { GET, POST, DELETE } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/publish/linkedin-direct", { method: "POST", body: JSON.stringify(body) });
const input = (extra: Record<string, unknown> = {}) => ({ companyId: "company-1", pieceId: "piece-1", socialAccountId: "account-1", ...extra });

beforeEach(() => {
  state.profile = { id: "user-1", role: "client", company_id: "company-1", can_publish: true };
  state.inserts = [];
  state.updates = [];
  state.media = { shape: "none", items: [] };
  state.tables = {
    content_pieces: [{ id: "piece-1", company_id: "company-1", approval_status: "approved", content_type: "social_post", markdown_body: "Approved post", first_comment: null }],
    company_social_accounts: [{ id: "account-1", company_id: "company-1", platform: "linkedin_personal", account_id: "person-1", account_name: "Selected profile", access_token_encrypted: "ciphertext", token_expires_at: new Date(Date.now() + 86400000).toISOString(), is_active: true }],
    content_images: [], content_assets: [], publishing_jobs: [],
  };
});

describe("POST /api/publish/linkedin-direct", () => {
  it("queues only an approved post for the exact selected account and future time", async () => {
    const scheduledFor = new Date(Date.now() + 3600000).toISOString();
    const response = await POST(request(input({ scheduledFor })));
    expect(response.status).toBe(201);
    expect(state.inserts[0].row).toMatchObject({ company_id: "company-1", content_piece_id: "piece-1", social_account_id: "account-1", target_platform: "linkedin_personal", status: "scheduled", scheduled_for: scheduledFor });
    expect(state.inserts[0].row.id).toBeTruthy();
  });

  it("refuses a different tenant before queueing", async () => {
    state.profile = { id: "user-2", role: "client", company_id: "company-2", can_publish: true };
    expect((await POST(request(input()))).status).toBe(401);
    expect(state.inserts).toHaveLength(0);
  });

  it("enforces can_publish for an authenticated company member", async () => {
    state.profile = { id: "user-1", role: "client", company_id: "company-1", can_publish: false };
    expect((await POST(request(input()))).status).toBe(403);
    expect(state.inserts).toHaveLength(0);
  });

  it("requires approval and refuses an account from another company", async () => {
    state.tables.content_pieces = [{ ...(state.tables.content_pieces as Record<string, unknown>[])[0], approval_status: "pending" }];
    expect((await POST(request(input()))).status).toBe(400);
    state.tables.content_pieces = [{ ...(state.tables.content_pieces as Record<string, unknown>[])[0], approval_status: "approved" }];
    state.tables.company_social_accounts = [{ ...(state.tables.company_social_accounts as Record<string, unknown>[])[0], company_id: "company-2" }];
    expect((await POST(request(input()))).status).toBe(404);
  });

  it("requires a future schedule and a usable token", async () => {
    expect((await POST(request(input({ scheduledFor: new Date(Date.now() - 1000).toISOString() })))).status).toBe(400);
    state.tables.company_social_accounts = [{ ...(state.tables.company_social_accounts as Record<string, unknown>[])[0], token_expires_at: null }];
    expect((await POST(request(input()))).status).toBe(409);
  });

  it("queues one video from our storage and refuses a video from anywhere else", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co");
    const url = "https://publishing-test.supabase.co/storage/v1/object/public/media/film.mp4";
    state.media = { shape: "video", items: [{ kind: "video", url, alt: "" }] };
    expect((await POST(request(input()))).status).toBe(201);
    expect(state.inserts[0].row.publish_payload).toMatchObject({ provider: "linkedin-direct-v1", image_urls: [], video_url: url });
    state.tables.publishing_jobs = [];
    state.media = { shape: "video", items: [{ kind: "video", url: "https://example.com/film.mp4", alt: "" }] };
    expect((await POST(request(input()))).status).toBe(422);
    vi.unstubAllEnvs();
  });

  it("uses deterministic identity to reject a duplicate queue request", async () => {
    const first = await POST(request(input()));
    expect(first.status).toBe(201);
    const duplicate = await POST(request(input()));
    expect(duplicate.status).toBe(409);
  });
});


describe("LinkedIn connection metadata and withdrawal", () => {
  it("reports a usable connection before any publishing account is selected", async () => {
    const response = await GET(new Request("http://localhost/api/publish/linkedin-direct?companyId=company-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.connected).toBe(true);
    expect(body.accounts[0]).toMatchObject({ id: "account-1", usable: true });
    expect(JSON.stringify(body)).not.toContain("ciphertext");
  });
  it("allows only administrators to withdraw grants", async () => {
    const response = await DELETE(request({ companyId: "company-1", socialAccountId: "account-1" }));
    expect(response.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });
  it("refuses an account outside the selected company and scopes every update", async () => {
    state.profile = { id: "admin-1", role: "admin" };
    const wrongTenant = await DELETE(request({ companyId: "company-2", socialAccountId: "account-1" }));
    expect(wrongTenant.status).toBe(404);
    expect(state.updates).toHaveLength(0);
    const response = await DELETE(request({ companyId: "company-1", socialAccountId: "account-1" }));
    expect(response.status).toBe(200);
    expect(state.updates[0].values).toEqual({ is_active: false, access_token_encrypted: null, refresh_token_encrypted: null });
    expect(state.updates[0].filters).toEqual(expect.arrayContaining([["company_id", "company-1"], ["id", "account-1"], ["platform", "linkedin_personal"]]));
  });
});
