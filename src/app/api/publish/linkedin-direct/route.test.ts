import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: { id: "user-1", role: "client", company_id: "company-1", can_publish: true } as Record<string, unknown> | null,
  tables: {} as Record<string, unknown>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
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
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve(rows()).then(resolve);
      return chain;
    },
  }),
}));
vi.mock("@/lib/hospitality/pack-guard", () => ({ refuseHospitality: async () => null }));
vi.mock("@/lib/content/piece-media", () => ({ resolvePieceMedia: () => ({ shape: "none", items: [] }) }));

import { POST } from "./route";

const request = (body: unknown) => new Request("http://localhost/api/publish/linkedin-direct", { method: "POST", body: JSON.stringify(body) });
const input = (extra: Record<string, unknown> = {}) => ({ companyId: "company-1", pieceId: "piece-1", socialAccountId: "account-1", ...extra });

beforeEach(() => {
  state.profile = { id: "user-1", role: "client", company_id: "company-1", can_publish: true };
  state.inserts = [];
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

  it("uses deterministic identity to reject a duplicate queue request", async () => {
    const first = await POST(request(input()));
    expect(first.status).toBe(201);
    const duplicate = await POST(request(input()));
    expect(duplicate.status).toBe(409);
  });
});
