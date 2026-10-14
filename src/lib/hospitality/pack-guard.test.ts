import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const state: { supabase: ReturnType<typeof fakeSupabase> } = { supabase: fakeSupabase() };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => state.supabase.client }));

import { refuseHospitality } from "./pack-guard";

const C = "11111111-1111-4111-8111-111111111111";
const pack = (post_pack: string | null) => fakeSupabase({ companies: { data: post_pack === null ? null : { post_pack } } });

beforeEach(() => {
  state.supabase = pack("hospitality");
});

describe("refuseHospitality", () => {
  it("answers a venue's own person with a plain 403 and a message", async () => {
    const res = await refuseHospitality({ role: "client" }, C);
    expect(res?.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("not_in_your_pack");
    expect(body.error).toContain("Write a post");
    expect(body.error).toContain("Talk through the week");
  });

  it("lets a business-to-business company through", async () => {
    state.supabase = pack("b2b");
    expect(await refuseHospitality({ role: "client" }, C)).toBeNull();
  });

  it("lets the operator through, even on a hospitality company", async () => {
    expect(await refuseHospitality({ role: "admin" }, C)).toBeNull();
  });

  it("lets a company through when its pack cannot be read, as before the hospitality pack existed", async () => {
    state.supabase = pack(null);
    expect(await refuseHospitality({ role: "client" }, C)).toBeNull();
    state.supabase = fakeSupabase({ companies: { data: null, error: { message: "column does not exist" } } });
    expect(await refuseHospitality({ role: "client" }, C)).toBeNull();
  });

  it("does nothing when there is no company", async () => {
    expect(await refuseHospitality({ role: "client" }, null)).toBeNull();
  });
});
