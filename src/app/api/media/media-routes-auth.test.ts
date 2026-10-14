import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

const state: { profile: unknown; supabase: ReturnType<typeof fakeSupabase> } = {
  profile: null,
  supabase: fakeSupabase(),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => state.profile,
  createAdminSupabaseClient: async () => state.supabase.client,
  requireAdmin: async () => {
    throw new Error("these routes must not call requireAdmin");
  },
}));

import { POST as signPost } from "@/app/api/upload/sign/route";
import { GET as bankGet } from "@/app/api/bank/route";
import { PATCH as bankPatch, DELETE as bankDelete } from "@/app/api/bank/[id]/route";
import { GET as viewGet } from "@/app/api/media/view/route";

const member = (company: string) => ({ id: "u1", role: "client", company_id: company });
const admin = { id: "a1", role: "admin", company_id: null };

function signRequest(companyId: string) {
  return new Request("http://x/api/upload/sign", {
    method: "POST",
    body: JSON.stringify({
      companyId,
      kind: "photo",
      filename: "deck.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1_000_000,
    }),
  });
}

beforeEach(() => {
  state.profile = null;
  state.supabase = fakeSupabase(
    { photo_inventory: { data: { id: ITEM, company_id: A, bucket: "captures", storage_path: `${A}/photos/x.jpg` } } },
    { storage: { createSignedUploadUrl: { data: { token: "tok", signedUrl: "https://signed" } }, createSignedUrl: { data: { signedUrl: "https://view" } } } }
  );
});

describe("POST /api/upload/sign", () => {
  it("refuses a signed-out caller", async () => {
    expect((await signPost(signRequest(A))).status).toBe(401);
  });

  it("lets a company member sign an upload for their own company", async () => {
    state.profile = member(A);
    const res = await signPost(signRequest(A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path.startsWith(`${A}/photos/`)).toBe(true);
  });

  it("refuses a member signing for another company", async () => {
    state.profile = member(A);
    expect((await signPost(signRequest(B))).status).toBe(403);
  });

  it("still lets an admin sign for any company", async () => {
    state.profile = admin;
    expect((await signPost(signRequest(B))).status).toBe(200);
  });
});

describe("GET /api/bank", () => {
  const req = (company: string) => new Request(`http://x/api/bank?companyId=${company}`);

  it("lists for a member of the company", async () => {
    state.profile = member(A);
    state.supabase = fakeSupabase({ photo_inventory: { data: [] } });
    expect((await bankGet(req(A))).status).toBe(200);
  });

  it("refuses a member listing another company", async () => {
    state.profile = member(A);
    expect((await bankGet(req(B))).status).toBe(403);
  });

  it("refuses a signed-out caller", async () => {
    expect((await bankGet(req(A))).status).toBe(401);
  });
});

describe("PATCH and DELETE /api/bank/[id]", () => {
  const ctx = { params: Promise.resolve({ id: ITEM }) };
  const patch = () =>
    new Request("http://x", { method: "PATCH", body: JSON.stringify({ tags: ["weather:sunny"] }) });

  it("lets a member edit tags on their own item", async () => {
    state.profile = member(A);
    expect((await bankPatch(patch(), ctx)).status).toBe(200);
  });

  it("answers 404 when the item belongs to another company", async () => {
    state.profile = member(B);
    expect((await bankPatch(patch(), ctx)).status).toBe(404);
    expect((await bankDelete(new Request("http://x"), ctx)).status).toBe(404);
  });

  it("refuses a signed-out caller", async () => {
    expect((await bankPatch(patch(), ctx)).status).toBe(401);
  });
});

describe("GET /api/media/view", () => {
  const url = (path: string) =>
    new Request(`http://x/api/media/view?bucket=captures&path=${encodeURIComponent(path)}`);

  it("serves a member their own company's capture", async () => {
    state.profile = member(A);
    expect((await viewGet(url(`${A}/photos/x.jpg`))).status).toBe(200);
  });

  it("refuses a member reading another company's capture", async () => {
    state.profile = member(A);
    expect((await viewGet(url(`${B}/photos/x.jpg`))).status).toBe(403);
  });

  it("does not serve a key with no company prefix", async () => {
    state.profile = member(A);
    expect((await viewGet(url("photos/x.jpg"))).status).toBe(404);
  });
});
