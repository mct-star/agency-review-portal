import { beforeEach, describe, expect, it, vi } from "vitest";
const { rows, requireAdmin, encryptJson } = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], requireAdmin: vi.fn(), encryptJson: vi.fn((value: unknown) => `encrypted:${JSON.stringify(value)}`) }));
vi.mock("@/lib/supabase/admin", () => ({ requireAdmin, createAdminSupabaseClient: async () => ({ from: () => {
  let predicates: ((row: Record<string, unknown>) => boolean)[] = [];
  let patch: Record<string, unknown> | undefined;
  let inserting = false;
  let payload: Record<string, unknown> | undefined;
  function run() {
    if (inserting && payload) {
      const existing = rows.find(r => r.company_id === payload!.company_id && r.service_category === payload!.service_category && r.provider === payload!.provider);
      if (existing) Object.assign(existing, payload); else rows.push({ id: "new", ...payload });
      return { data: { ...(existing ?? rows[rows.length - 1]) }, error: null };
    }
    const matching = rows.filter(r => predicates.every(p => p(r)));
    if (patch) matching.forEach(r => Object.assign(r, patch));
    return { data: matching[0] ? { ...matching[0] } : null, error: null };
  }
  const query = {
    select: () => query,
    eq: (k: string, v: unknown) => { predicates.push(r => r[k] === v); return query; },
    neq: (k: string, v: unknown) => { predicates.push(r => r[k] !== v); return query; },
    update: (p: Record<string, unknown>) => { patch = p; return query; },
    upsert: (p: Record<string, unknown>) => { inserting = true; payload = p; return query; },
    maybeSingle: async () => run(), single: async () => run(),
    order: async () => ({ data: rows.filter(r => predicates.every(p => p(r))).map(r => ({ ...r })), error: null }),
    then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return query;
} }) }));
vi.mock("@/lib/crypto", () => ({ encryptJson }));
import { GET, POST } from "./route";
function request(body: unknown) { return new Request("https://test/api/config/api-providers", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); }
const save = (more = {}) => request({ companyId: "a", serviceCategory: "content_generation", provider: "anthropic_claude", ...more });
beforeEach(() => {
  rows.length = 0;
  rows.push({ id: "a", company_id: "a", service_category: "content_generation", provider: "anthropic_claude", credentials_encrypted: "existing-ciphertext", provider_settings: { utility_tier: "quality" }, is_active: true });
  rows.push({ id: "b", company_id: "b", service_category: "content_generation", provider: "openai_gpt4", credentials_encrypted: "other-company-ciphertext", provider_settings: {}, is_active: true });
  requireAdmin.mockResolvedValue({ id: "admin" }); encryptJson.mockClear();
});
describe("admin provider settings", () => {
  it("retains existing encrypted credentials on a blank-key save", async () => {
    const response = await POST(save({ providerSettings: { utility_tier: "economy" } }));
    expect(response.status).toBe(200);
    expect(rows[0].credentials_encrypted).toBe("existing-ciphertext");
    expect(rows[0].provider_settings).toEqual({ utility_tier: "economy" });
    expect(encryptJson).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("ciphertext");
  });
  it("refuses to reuse another provider or company's key when switching", async () => {
    expect((await POST(save({ provider: "openai_gpt4" }))).status).toBe(400);
    expect(rows[0].is_active).toBe(true);
    expect(rows[1].is_active).toBe(true);
  });
  it("encrypts the new key and changes only this company's active writer", async () => {
    const response = await POST(save({ provider: "openai_gpt4", credentials: { api_key: "new-key" }, providerSettings: { utility_tier: "economy", api_key: "must-not-persist" } }));
    expect(response.status).toBe(200);
    expect(encryptJson).toHaveBeenCalledWith({ api_key: "new-key" });
    expect(rows.find(r => r.id === "a")!.is_active).toBe(false);
    expect(rows.find(r => r.id === "b")!.is_active).toBe(true);
    expect(rows.find(r => r.id === "new")!.provider_settings).toEqual({ utility_tier: "economy" });
    expect(JSON.stringify(await response.json())).not.toMatch(/new-key|must-not-persist|ciphertext/);
  });
  it("returns only the requested company's masked configuration", async () => {
    const response = await GET(new Request("https://test/api/config/api-providers?companyId=a"));
    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0]).toMatchObject({ company_id: "a", has_credentials: true });
    expect(JSON.stringify(data)).not.toContain("ciphertext");
  });
  it("rejects unauthorised and malformed requests", async () => {
    requireAdmin.mockResolvedValueOnce(null);
    expect((await POST(save())).status).toBe(401);
    expect((await POST(new Request("https://test", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(save({ provider: "unapproved" }))).status).toBe(400);
  });
});
