import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  companyUser: true,
  admin: false,
  personCompany: "company-a" as string | null,
  isPrimary: false,
  uploads: [] as string[],
  companyUpdates: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: async () => (state.admin ? { id: "staff" } : null),
  requireCompanyUser: async () => (state.companyUser ? { id: "client-user" } : null),
  createAdminSupabaseClient: async () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (field: string, value: unknown) => {
        filters[field] = value;
        return query;
      };
      query.maybeSingle = async () => ({
        data: table === "company_spokespersons" && filters.company_id === state.personCompany ? { id: filters.id, is_primary: state.isPrimary } : null,
      });
      query.update = () => {
        state.companyUpdates += 1;
        return query;
      };
      return query;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  }),
}));

import { POST } from "./route";

function upload(fields: Record<string, string>) {
  const body = new FormData();
  body.append("file", new File(["photo"], "me.jpg", { type: "image/jpeg" }));
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return POST(new Request("http://test/api/upload/logo", { method: "POST", body }));
}

const photo = { companyId: "company-a", type: "person_photo", spokespersonId: "person-1" };

describe("POST /api/upload/logo, person_photo", () => {
  beforeEach(() => {
    state.companyUser = true;
    state.admin = false;
    state.personCompany = "company-a";
    state.isPrimary = false;
    state.uploads = [];
    state.companyUpdates = 0;
  });

  it("gives two people two paths and leaves the company photo alone", async () => {
    await upload(photo);
    await upload({ ...photo, spokespersonId: "person-2" });
    expect(state.uploads[0]).toContain("people/company-a/person-1/");
    expect(state.uploads[1]).toContain("people/company-a/person-2/");
    expect(state.companyUpdates).toBe(0);
  });

  it("keeps the company photo in step with the primary person", async () => {
    state.isPrimary = true;
    await upload(photo);
    expect(state.companyUpdates).toBe(1);
  });

  it("refuses a person from another company", async () => {
    state.personCompany = "company-b";
    const res = await upload(photo);
    expect(res.status).toBe(404);
    expect(state.uploads).toEqual([]);
  });

  it("refuses a caller outside the company", async () => {
    state.companyUser = false;
    const res = await upload(photo);
    expect(res.status).toBe(401);
    expect(state.uploads).toEqual([]);
  });

  it("keeps every other upload type admin-only", async () => {
    const res = await upload({ companyId: "company-a", type: "logo" });
    expect(res.status).toBe(401);
    expect(state.uploads).toEqual([]);
  });
});
