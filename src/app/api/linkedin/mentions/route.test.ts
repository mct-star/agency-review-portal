import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: "company-1" as string | null, rows: [] as Array<Record<string, unknown>>, filters: [] as Array<[string, unknown]> }));
vi.mock("@/lib/auth/channel-manager", () => ({
  authoriseChannelManager: vi.fn(async (companyId: string | null | undefined) => companyId && companyId === state.allowed
    ? { ok: true, profile: {} }
    : { ok: false, status: 403, response: new Response(JSON.stringify({ error: "no" }), { status: 403 }) }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({
    from: () => {
      const chain: Record<string, any> = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.eq = (k: string, v: unknown) => { state.filters.push([k, v]); return chain; };
      chain.insert = (row: Record<string, unknown>) => { state.rows.push(row); return chain; };
      chain.delete = () => chain;
      chain.maybeSingle = async () => ({ data: state.rows.at(-1) ?? null, error: null });
      chain.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: state.rows, error: null }).then(resolve);
      return chain;
    },
  }),
}));

import { DELETE, GET, POST } from "./route";
const post = (body: Record<string, unknown>) => POST(new Request("http://x/api/linkedin/mentions", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => { state.allowed = "company-1"; state.rows = []; state.filters = []; });

describe("/api/linkedin/mentions", () => {
  it("saves a valid person entry and scopes it to the company", async () => {
    const res = await post({ companyId: "company-1", name: "  Jane   Smith ", urn: "urn:li:person:abc123", kind: "person" });
    expect(res.status).toBe(201);
    expect(state.rows[0]).toMatchObject({ company_id: "company-1", name: "Jane Smith", urn: "urn:li:person:abc123", kind: "person" });
  });

  it("refuses a URN of the wrong kind and an empty name", async () => {
    expect((await post({ companyId: "company-1", name: "Contura", urn: "urn:li:person:1", kind: "organization" })).status).toBe(400);
    expect((await post({ companyId: "company-1", name: " ", urn: "urn:li:person:abc", kind: "person" })).status).toBe(400);
    expect(state.rows).toHaveLength(0);
  });

  it("refuses another company's list for read, write and delete", async () => {
    expect((await GET(new Request("http://x/api/linkedin/mentions?companyId=company-2"))).status).toBe(403);
    expect((await post({ companyId: "company-2", name: "Jane", urn: "urn:li:person:abc", kind: "person" })).status).toBe(403);
    expect((await DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ companyId: "company-2", id: "m1" }) }))).status).toBe(403);
    expect(state.rows).toHaveLength(0);
  });

  it("deletes only within the company", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ companyId: "company-1", id: "m1" }) }));
    expect(res.status).toBe(200);
    expect(state.filters).toContainEqual(["company_id", "company-1"]);
  });
});
