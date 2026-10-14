import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const CO = "11111111-1111-4111-8111-111111111111";
const TOKEN = "tok_" + "a".repeat(30);

const state: { supabase: ReturnType<typeof fakeSupabase> } = { supabase: fakeSupabase() };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => state.supabase.client }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/staff-upload/notify", () => ({ notifyStaffPhotosPending: async () => undefined }));

import { POST as sign } from "./[token]/sign/route";
import { POST as register } from "./[token]/register/route";

const company = { id: CO, name: "Lakeside", plan: "starter", trial_plan: null, trial_expires_at: null, staff_upload_enabled: true };
const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) });
const signReq = (over: Record<string, unknown> = {}) =>
  new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "203.0.113.5" }, body: JSON.stringify({ filename: "bar.jpg", mimeType: "image/jpeg", sizeBytes: 3_000_000, ...over }) });

function build(extra: Record<string, unknown> = {}, storage: Record<string, { data?: unknown }> = { createSignedUploadUrl: { data: { token: "t", signedUrl: "https://signed" } } }) {
  return fakeSupabase(
    {
      companies: { data: company },
      staff_upload_attempts: { count: 1 },
      photo_inventory: { data: null },
      "rpc:company_media_bytes": { data: 0 },
      ...extra,
    },
    { storage }
  );
}

beforeEach(() => { state.supabase = build(); });

describe("staff upload sign", () => {
  it("signs a photo into the company's staff folder", async () => {
    const res = await sign(signReq(), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).path.startsWith(`${CO}/staff/`)).toBe(true);
  });

  it("does not work for an unknown or switched-off link", async () => {
    state.supabase = build({ companies: { data: null } });
    expect((await sign(signReq(), ctx())).status).toBe(404);
    state.supabase = build({ companies: { data: { ...company, staff_upload_enabled: false } } });
    expect((await sign(signReq(), ctx())).status).toBe(404);
    expect((await sign(signReq(), ctx("short"))).status).toBe(404);
  });

  it("takes photos only, and nothing over 25 MB", async () => {
    expect((await sign(signReq({ mimeType: "video/mp4" }), ctx())).status).toBe(415);
    expect((await sign(signReq({ mimeType: "image/heic" }), ctx())).status).toBe(415);
    expect((await sign(signReq({ sizeBytes: 26 * 1024 * 1024 }), ctx())).status).toBe(413);
  });

  it("is rate limited", async () => {
    state.supabase = build({ staff_upload_attempts: { count: 40 } });
    expect((await sign(signReq(), ctx())).status).toBe(429);
  });

  it("fails closed when the attempt cannot be recorded", async () => {
    state.supabase = build({ staff_upload_attempts: { error: { message: "db down" } } });
    expect((await sign(signReq(), ctx())).status).toBe(429);
  });

  it("says already in the library for a known photo", async () => {
    state.supabase = build({ photo_inventory: { data: { id: "x" } } });
    const res = await sign(signReq({ sha256: "b".repeat(64) }), ctx());
    expect((await res.json()).alreadyExists).toBe(true);
  });

  it("refuses when the library is full", async () => {
    state.supabase = build({ "rpc:company_media_bytes": { data: 5 * 1024 ** 3 } });
    expect((await sign(signReq(), ctx())).status).toBe(413);
  });
});

describe("staff upload register", () => {
  const regReq = (path: string, extra: Record<string, unknown> = {}) =>
    new Request("http://x", { method: "POST", body: JSON.stringify({ bucket: "captures", path, mimeType: "image/jpeg", sizeBytes: 1000, originalFilename: "bar.jpg", ...extra }) });

  it("refuses a path outside the company's staff folder", async () => {
    expect((await register(regReq(`${CO}/photos/x.jpg`), ctx())).status).toBe(400);
    expect((await register(regReq(`22222222-2222-4222-8222-222222222222/staff/x.jpg`), ctx())).status).toBe(400);
    expect((await register(regReq(`${CO}/staff/../photos/x.jpg`), ctx())).status).toBe(400);
  });

  it("reports an upload that never finished", async () => {
    state.supabase = build({}, { list: { data: [] } });
    expect((await register(regReq(`${CO}/staff/x.jpg`), ctx())).status).toBe(404);
  });

  it("removes and refuses a file that is not a photo or is too big, whatever was declared", async () => {
    state.supabase = build({}, { list: { data: [{ name: "x.mp4", metadata: { size: 900_000_000, mimetype: "video/mp4" } }] } });
    const res = await register(regReq(`${CO}/staff/x.mp4`), ctx());
    expect(res.status).toBe(413);
    expect(state.supabase.storageCalls.some((c) => c.method === "remove")).toBe(true);
  });

  it("lands a good photo as pending", async () => {
    state.supabase = build(
      { photo_inventory: { data: { id: "row1" } } },
      { list: { data: [{ name: "x.jpg", metadata: { size: 2000, mimetype: "image/jpeg" } }] }, download: { data: null } }
    );
    const res = await register(regReq(`${CO}/staff/x.jpg`, { submittedBy: "Jess" }), ctx());
    expect(res.status).toBe(200);
    const insert = state.supabase.calls.find((c) => c.table === "photo_inventory" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ status: "pending", source: "staff_link", submitted_by: "Jess", company_id: CO });
  });
});
