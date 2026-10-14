import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

const state: { profile: unknown; supabase: ReturnType<typeof fakeSupabase> } = {
  profile: null,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => state.profile,
  createAdminSupabaseClient: async () => state.supabase.client,
}));

import { authoriseBankItem, authoriseCompany } from "./access";

beforeEach(() => {
  state.profile = null;
  state.supabase = fakeSupabase({ photo_inventory: { data: { id: ITEM, company_id: COMPANY_A } } });
});

describe("authoriseCompany", () => {
  it("refuses a signed-out caller with 401", async () => {
    const r = await authoriseCompany(COMPANY_A);
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("lets a member of the company in", async () => {
    state.profile = { id: "u1", role: "client", company_id: COMPANY_A };
    expect(await authoriseCompany(COMPANY_A)).toMatchObject({ ok: true });
  });

  it("refuses a member asking for a different company with 403", async () => {
    state.profile = { id: "u1", role: "client", company_id: COMPANY_A };
    expect(await authoriseCompany(COMPANY_B)).toMatchObject({ ok: false, status: 403 });
  });

  it("lets an admin into any company", async () => {
    state.profile = { id: "a1", role: "admin", company_id: null };
    expect(await authoriseCompany(COMPANY_B)).toMatchObject({ ok: true });
  });

  it("rejects a missing or malformed company id with 400", async () => {
    state.profile = { id: "u1", role: "client", company_id: COMPANY_A };
    expect(await authoriseCompany(undefined)).toMatchObject({ ok: false, status: 400 });
    expect(await authoriseCompany("not-a-uuid")).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a user with no company at all", async () => {
    state.profile = { id: "u2", role: "client", company_id: null };
    expect(await authoriseCompany(COMPANY_A)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("authoriseBankItem", () => {
  it("returns the item for a member of its company", async () => {
    state.profile = { id: "u1", role: "client", company_id: COMPANY_A };
    const r = await authoriseBankItem(ITEM);
    expect(r).toMatchObject({ ok: true, item: { company_id: COMPANY_A } });
  });

  it("answers 404, not 403, when the item belongs to another company", async () => {
    state.profile = { id: "u9", role: "client", company_id: COMPANY_B };
    expect(await authoriseBankItem(ITEM)).toMatchObject({ ok: false, status: 404 });
  });

  it("answers 404 when the item does not exist", async () => {
    state.profile = { id: "a1", role: "admin", company_id: null };
    state.supabase = fakeSupabase({ photo_inventory: { data: null } });
    expect(await authoriseBankItem(ITEM)).toMatchObject({ ok: false, status: 404 });
  });

  it("lets an admin reach any company's item", async () => {
    state.profile = { id: "a1", role: "admin", company_id: null };
    expect(await authoriseBankItem(ITEM)).toMatchObject({ ok: true });
  });

  it("refuses a signed-out caller with 401 before looking anything up", async () => {
    const r = await authoriseBankItem(ITEM);
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(state.supabase.calls).toHaveLength(0);
  });
});
