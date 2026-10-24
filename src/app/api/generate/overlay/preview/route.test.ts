import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authorised: false,
  adminClientCalls: 0,
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async () => state.authorised ? { id: "client-user", company_id: "company-a" } : null,
  createAdminSupabaseClient: async () => {
    state.adminClientCalls += 1;
    return {
      from(table: string) {
        const query: Record<string, unknown> = {};
        query.select = () => query;
        query.eq = (field: string, value: unknown) => {
          state.filters.push([table, field, value]);
          return query;
        };
        query.limit = () => query;
        query.single = async () => table === "companies"
          ? { data: { name: "Client", spokesperson_name: null, brand_color: "#123456", logo_url: null, overlay_logo_url: null, profile_picture_url: null } }
          : { data: { name: "Andrew", photo_url: null } };
        return query;
      },
    };
  },
}));

vi.mock("@/lib/image/brand-overlay", () => ({
  applyBrandOverlay: async () => ({ buffer: Buffer.from("image"), width: 1, height: 1 }),
}));

vi.mock("sharp", () => ({
  default: () => ({ png: () => ({ toBuffer: async () => Buffer.from("sample") }) }),
}));

import { GET } from "./route";

describe("overlay preview access", () => {
  beforeEach(() => {
    state.authorised = false;
    state.adminClientCalls = 0;
    state.filters = [];
  });

  it("refuses an unauthorised company before privileged data reads", async () => {
    const response = await GET(new Request("https://portal.test/api/generate/overlay/preview?companyId=company-b"));

    expect(response.status).toBe(401);
    expect(state.adminClientCalls).toBe(0);
  });

  it("allows an authorised company and scopes branding and spokesperson reads to it", async () => {
    state.authorised = true;
    const response = await GET(new Request("https://portal.test/api/generate/overlay/preview?companyId=company-a"));

    expect(response.status).toBe(200);
    expect(state.filters).toContainEqual(["companies", "id", "company-a"]);
    expect(state.filters).toContainEqual(["company_spokespersons", "company_id", "company-a"]);
  });
});
