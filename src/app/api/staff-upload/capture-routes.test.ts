import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { signCaptureGrant } from "@/lib/staff-upload/token";

const CO = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PIECE = "33333333-3333-4333-8333-333333333333";
const TOKEN = "tok_" + "a".repeat(30);
const SECRET = "test-capture-secret";
const NOW = Date.now();

const state: { supabase: ReturnType<typeof fakeSupabase> } = { supabase: fakeSupabase() };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => state.supabase.client }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/staff-upload/notify", () => ({ notifyStaffPhotosPending: async () => undefined }));

import { POST as sign } from "./[token]/sign/route";
import { POST as register } from "./[token]/register/route";

const company = { id: CO, name: "AGENCY", plan: "starter", trial_plan: null, trial_expires_at: null, staff_upload_enabled: true };
const ctx = () => ({ params: Promise.resolve({ token: TOKEN }) });
const grant = (over: { companyId?: string; pieceId?: string; now?: number } = {}) =>
  signCaptureGrant({ companyId: over.companyId ?? CO, pieceId: over.pieceId ?? PIECE }, SECRET, over.now ?? NOW);

function build(extra: Record<string, unknown> = {}, storage: Record<string, { data?: unknown }> = { createSignedUploadUrl: { data: { token: "t", signedUrl: "https://signed" } } }) {
  return fakeSupabase(
    {
      companies: { data: company },
      staff_upload_attempts: { count: 1 },
      content_pieces: { data: { id: PIECE, company_id: CO } },
      content_assets: { data: { id: "asset1" } },
      "rpc:company_media_bytes": { data: 0 },
      ...extra,
    },
    { storage }
  );
}

const signReq = (capture: string | undefined, over: Record<string, unknown> = {}) =>
  new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "203.0.113.5" }, body: JSON.stringify({ filename: "talk.mov", mimeType: "video/quicktime", sizeBytes: 80_000_000, capture, ...over }) });
const regReq = (capture: string | undefined, path: string, over: Record<string, unknown> = {}) =>
  new Request("http://x", { method: "POST", body: JSON.stringify({ bucket: "captures", path, capture, mimeType: "video/quicktime", sizeBytes: 1000, originalFilename: "talk.mov", durationSeconds: 42, ...over }) });
const goodPath = `${CO}/capture/${PIECE}/talk.mov`;
const stored = { list: { data: [{ name: "talk.mov", metadata: { size: 5000, mimetype: "video/quicktime" } }] } };

beforeEach(() => {
  process.env.CAPTURE_LINK_SECRET = SECRET;
  state.supabase = build();
});

describe("capture link: sign", () => {
  it("signs a video into the piece's own private folder", async () => {
    const res = await sign(signReq(grant()), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bucket).toBe("captures");
    expect(json.path.startsWith(`${CO}/capture/${PIECE}/`)).toBe(true);
  });

  it("refuses an expired link", async () => {
    const old = grant({ now: NOW - 30 * 24 * 3600 * 1000 });
    const res = await sign(signReq(old), ctx());
    expect(res.status).toBe(403);
    expect(state.supabase.storageCalls.length).toBe(0);
  });

  it("refuses a link signed for another company, and a tampered one", async () => {
    expect((await sign(signReq(grant({ companyId: OTHER })), ctx())).status).toBe(403);
    expect((await sign(signReq(grant() + "x"), ctx())).status).toBe(403);
  });

  it("refuses another company's piece before writing anything", async () => {
    state.supabase = build({ content_pieces: { data: { id: PIECE, company_id: OTHER } } });
    const res = await sign(signReq(grant()), ctx());
    expect(res.status).toBe(404);
    expect(state.supabase.storageCalls.length).toBe(0);
  });

  it("refuses a piece that does not exist", async () => {
    state.supabase = build({ content_pieces: { data: null } });
    expect((await sign(signReq(grant()), ctx())).status).toBe(404);
  });

  it("refuses everything when no signing secret is configured", async () => {
    delete process.env.CAPTURE_LINK_SECRET;
    delete process.env.STAFF_UPLOAD_SALT;
    expect((await sign(signReq(grant()), ctx())).status).toBe(403);
  });

  it("takes video only, up to the video limit", async () => {
    expect((await sign(signReq(grant(), { mimeType: "image/jpeg" }), ctx())).status).toBe(415);
    expect((await sign(signReq(grant(), { sizeBytes: 3 * 1024 ** 3 }), ctx())).status).toBe(413);
  });

  it("leaves the photo link unchanged: video without a capture link is still refused", async () => {
    expect((await sign(signReq(undefined), ctx())).status).toBe(415);
  });
});

describe("capture link: register", () => {
  it("attaches the video to the piece as raw video in the private bucket", async () => {
    state.supabase = build({}, stored);
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(200);
    const insert = state.supabase.calls.find((c) => c.table === "content_assets" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      content_piece_id: PIECE,
      file_url: null,
      storage_path: goodPath,
      asset_metadata: { type: "raw_video", bucket: "captures", originalFilename: "talk.mov" },
    });
  });

  it("refuses an expired link and writes nothing", async () => {
    state.supabase = build({}, stored);
    const res = await register(regReq(grant({ now: NOW - 30 * 24 * 3600 * 1000 }), goodPath), ctx());
    expect(res.status).toBe(403);
    expect(state.supabase.calls.some((c) => c.table === "content_assets" && c.method === "insert")).toBe(false);
  });

  it("refuses another company's piece and writes nothing", async () => {
    state.supabase = build({ content_pieces: { data: { id: PIECE, company_id: OTHER } } }, stored);
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(404);
    expect(state.supabase.calls.some((c) => c.table === "content_assets" && c.method === "insert")).toBe(false);
  });

  it("refuses a path outside this piece's folder", async () => {
    state.supabase = build({}, stored);
    expect((await register(regReq(grant(), `${CO}/capture/${OTHER}/talk.mov`), ctx())).status).toBe(400);
    expect((await register(regReq(grant(), `${CO}/staff/talk.mov`), ctx())).status).toBe(400);
    expect((await register(regReq(grant(), `${CO}/capture/${PIECE}/../x.mov`), ctx())).status).toBe(400);
  });

  it("removes and refuses a stored file that is not a video", async () => {
    state.supabase = build({}, { list: { data: [{ name: "talk.mov", metadata: { size: 5000, mimetype: "image/jpeg" } }] } });
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(413);
    expect(state.supabase.storageCalls.some((c) => c.method === "remove")).toBe(true);
  });
});
