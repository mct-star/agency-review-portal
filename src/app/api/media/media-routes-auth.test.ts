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
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
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

describe("POST /api/upload/sign: dedupe, quota and resume", () => {
  const withBody = (extra: Record<string, unknown>) =>
    new Request("http://x/api/upload/sign", {
      method: "POST",
      body: JSON.stringify({ companyId: A, kind: "photo", filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 2_000_000, ...extra }),
    });

  it("says already in the library, and signs nothing, when the hash is held", async () => {
    state.profile = member(A);
    state.supabase = fakeSupabase({ photo_inventory: { data: { id: ITEM, kind: "photo" } } });
    const res = await signPost(withBody({ sha256: "a".repeat(64) }));
    const body = await res.json();
    expect(body.alreadyExists).toBe(true);
    expect(state.supabase.storageCalls).toHaveLength(0);
  });

  it("refuses an upload that would take the company over its plan cap", async () => {
    state.profile = member(A);
    state.supabase = fakeSupabase(
      {
        photo_inventory: { data: null },
        companies: { data: { plan: "starter", trial_plan: null, trial_expires_at: null } },
        "rpc:company_media_bytes": { data: 5 * 1024 ** 3 - 1000 },
      },
      { storage: { createSignedUploadUrl: { data: { token: "t", signedUrl: "u" } } } }
    );
    const res = await signPost(withBody({}));
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("library_full");
    expect(state.supabase.storageCalls).toHaveLength(0);
  });

  it("lets the same upload through when there is room", async () => {
    state.profile = member(A);
    state.supabase = fakeSupabase(
      {
        photo_inventory: { data: null },
        companies: { data: { plan: "starter", trial_plan: null, trial_expires_at: null } },
        "rpc:company_media_bytes": { data: 1024 ** 3 },
      },
      { storage: { createSignedUploadUrl: { data: { token: "t", signedUrl: "u" } } } }
    );
    expect((await signPost(withBody({}))).status).toBe(200);
  });

  it("renews the token for an upload already in flight, on the same key", async () => {
    state.profile = member(A);
    const path = `${A}/videos/20261014_1_clip.mp4`;
    const res = await signPost(withBody({ kind: "video", mimeType: "video/mp4", resumePath: path }));
    const body = await res.json();
    expect(body.path).toBe(path);
    expect(body.tusEndpoint).toContain(".storage.supabase.co/storage/v1/upload/resumable/sign");
  });

  it("will not renew a token for another company's key", async () => {
    state.profile = member(A);
    const res = await signPost(withBody({ resumePath: `${B}/videos/x.mp4` }));
    expect(res.status).toBe(400);
  });
});
