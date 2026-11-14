import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type RecordedCall, type TableConfig } from "@/test/fake-supabase";
import { signCaptureGrant, verifyCaptureGrant, CAPTURE_GRANT_MAX_USES, CAPTURE_LINK_TTL_SECONDS } from "@/lib/staff-upload/token";
import { mintCaptureGrant, revokeCaptureGrants } from "@/lib/staff-upload/capture";

const CO = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PIECE = "33333333-3333-4333-8333-333333333333";
const OTHER_PIECE = "55555555-5555-4555-8555-555555555555";
const GRANT_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "tok_" + "a".repeat(30);
const SECRET = "test-capture-secret";
const NOW = Date.now();
const HOUR = 3600 * 1000;

const state: { supabase: ReturnType<typeof fakeSupabase> } = { supabase: fakeSupabase() };
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => state.supabase.client }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/staff-upload/notify", () => ({ notifyStaffPhotosPending: async () => undefined }));

import { POST as sign } from "./[token]/sign/route";
import { POST as register } from "./[token]/register/route";

const company = { id: CO, name: "AGENCY", plan: "starter", trial_plan: null, trial_expires_at: null, staff_upload_enabled: true };
const ctx = () => ({ params: Promise.resolve({ token: TOKEN }) });
const grant = (over: { companyId?: string; pieceId?: string; grantId?: string; now?: number } = {}) =>
  signCaptureGrant({ companyId: over.companyId ?? CO, pieceId: over.pieceId ?? PIECE, grantId: over.grantId ?? GRANT_ID }, SECRET, over.now ?? NOW);

/** A stored grant row, and a stand-in for the compare-and-swap that counts a use. */
interface GrantRow { id: string; company_id: string; content_piece_id: string; expires_at: string; use_count: number; max_uses: number; revoked: boolean }
function grantRow(over: Partial<GrantRow> = {}): GrantRow {
  return { id: GRANT_ID, company_id: CO, content_piece_id: PIECE, expires_at: new Date(NOW + 40 * HOUR).toISOString(), use_count: 0, max_uses: 3, revoked: false, ...over };
}
function grantsTable(row: GrantRow | null, opts: { error?: boolean } = {}) {
  return (calls: RecordedCall[]) => {
    if (opts.error) return { data: null, error: { message: 'relation "capture_grants" does not exist', code: "42P01" } };
    const update = calls.find((c) => c.method === "update");
    if (!update) return { data: row };
    // The update only lands when the row still has the use count the caller read, and is open.
    const expected = calls.find((c) => c.method === "eq" && c.args[0] === "use_count")?.args[1];
    if (!row || row.revoked || row.use_count !== expected || row.use_count >= row.max_uses) return { data: [] };
    row.use_count += 1;
    return { data: [{ id: row.id }] };
  };
}

function build(extra: TableConfig = {}, storage: Record<string, { data?: unknown }> = { createSignedUploadUrl: { data: { token: "t", signedUrl: "https://signed" } } }, row: GrantRow | null = grantRow()) {
  return fakeSupabase(
    {
      companies: { data: company },
      staff_upload_attempts: { count: 1 },
      capture_grants: grantsTable(row),
      content_pieces: { data: { id: PIECE, company_id: CO } },
      // A select finds no earlier row for the path; an insert returns the new row.
      content_assets: (calls) => (calls.some((c) => c.method === "insert") ? { data: { id: "asset1" } } : { data: [] }),
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
const inserted = () => state.supabase.calls.some((c) => c.table === "content_assets" && c.method === "insert");

beforeEach(() => {
  process.env.CAPTURE_LINK_SECRET = SECRET;
  delete process.env.STAFF_UPLOAD_SALT;
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
    const old = grant({ now: NOW - 30 * 24 * HOUR });
    const res = await sign(signReq(old), ctx());
    expect(res.status).toBe(403);
    expect(state.supabase.storageCalls.length).toBe(0);
  });

  it("refuses a link whose signature is fine but whose stored grant has expired", async () => {
    state.supabase = build({}, undefined, grantRow({ expires_at: new Date(NOW - 1000).toISOString() }));
    expect((await sign(signReq(grant()), ctx())).status).toBe(403);
    expect(state.supabase.storageCalls.length).toBe(0);
  });

  it("refuses a link signed 49 hours ago", async () => {
    expect((await sign(signReq(grant({ now: NOW - 49 * HOUR })), ctx())).status).toBe(403);
  });

  it("refuses a link whose grant has used up its places, or was withdrawn", async () => {
    state.supabase = build({}, undefined, grantRow({ use_count: 3 }));
    expect((await sign(signReq(grant()), ctx())).status).toBe(403);
    state.supabase = build({}, undefined, grantRow({ revoked: true }));
    expect((await sign(signReq(grant()), ctx())).status).toBe(403);
    expect(state.supabase.storageCalls.length).toBe(0);
  });

  it("refuses a link signed for another company, and a tampered one", async () => {
    expect((await sign(signReq(grant({ companyId: OTHER })), ctx())).status).toBe(403);
    expect((await sign(signReq(grant() + "x"), ctx())).status).toBe(403);
  });

  it("refuses a link with no stored grant behind it", async () => {
    state.supabase = build({}, undefined, null);
    expect((await sign(signReq(grant()), ctx())).status).toBe(403);
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

  it("refuses everything when no dedicated signing secret is configured", async () => {
    const link = grant();
    delete process.env.CAPTURE_LINK_SECRET;
    expect((await sign(signReq(link), ctx())).status).toBe(403);
  });

  it("does not fall back to the IP hash salt as a signing secret", async () => {
    delete process.env.CAPTURE_LINK_SECRET;
    process.env.STAFF_UPLOAD_SALT = SECRET; // the old fallback: a link signed with it must now be refused
    expect((await sign(signReq(grant()), ctx())).status).toBe(403);
    expect(state.supabase.storageCalls.length).toBe(0);
  });

  it("takes video only, up to the video limit", async () => {
    expect((await sign(signReq(grant(), { mimeType: "image/jpeg" }), ctx())).status).toBe(415);
    expect((await sign(signReq(grant(), { sizeBytes: 3 * 1024 ** 3 }), ctx())).status).toBe(413);
  });

  it("leaves the photo link unchanged: video without a capture link is still refused", async () => {
    expect((await sign(signReq(undefined), ctx())).status).toBe(415);
  });

  it("fails closed, not open, while the capture_grants table does not exist", async () => {
    state.supabase = build({ capture_grants: grantsTable(null, { error: true }) });
    const res = await sign(signReq(grant()), ctx());
    expect(res.status).toBe(503);
    expect(state.supabase.storageCalls.length).toBe(0);
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
      asset_metadata: { type: "raw_video", bucket: "captures", originalFilename: "talk.mov", mimeType: "video/quicktime", sizeBytes: 5000 },
    });
  });

  it("counts the use, and refuses a fourth video on the same link", async () => {
    const row = grantRow();
    const names = ["a.mov", "b.mov", "c.mov", "d.mov"];
    const list = { list: { data: names.map((name) => ({ name, metadata: { size: 5000, mimetype: "video/quicktime" } })) } };
    state.supabase = build({}, list, row);
    const results: number[] = [];
    for (const n of names) results.push((await register(regReq(grant(), `${CO}/capture/${PIECE}/${n}`), ctx())).status);
    expect(results).toEqual([200, 200, 200, 403]);
    expect(row.use_count).toBe(CAPTURE_GRANT_MAX_USES);
    expect(state.supabase.calls.filter((c) => c.table === "content_assets" && c.method === "insert")).toHaveLength(3);
  });

  it("refuses a link already at its cap before reading anything about the file", async () => {
    state.supabase = build({}, stored, grantRow({ use_count: 3 }));
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(403);
    expect(state.supabase.storageCalls).toHaveLength(0);
    expect(state.supabase.calls.some((c) => c.table === "content_pieces")).toBe(false);
    expect(inserted()).toBe(false);
  });

  it("refuses the loser of a race for the last place, and writes nothing", async () => {
    // The row read says 2 of 3 used, but another upload took the place before our update landed.
    const row = grantRow({ use_count: 2 });
    const racing = (calls: RecordedCall[]) => {
      if (calls.some((c) => c.method === "update")) return { data: [] };
      return { data: { ...row } };
    };
    state.supabase = build({ capture_grants: racing }, stored);
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("refuses an expired link and writes nothing", async () => {
    state.supabase = build({}, stored);
    const res = await register(regReq(grant({ now: NOW - 30 * 24 * HOUR }), goodPath), ctx());
    expect(res.status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("refuses a link signed 49 hours ago, and a stored grant past its expiry", async () => {
    state.supabase = build({}, stored);
    expect((await register(regReq(grant({ now: NOW - 49 * HOUR }), goodPath), ctx())).status).toBe(403);
    state.supabase = build({}, stored, grantRow({ expires_at: new Date(NOW - 1000).toISOString() }));
    expect((await register(regReq(grant(), goodPath), ctx())).status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("refuses a withdrawn link and writes nothing", async () => {
    state.supabase = build({}, stored, grantRow({ revoked: true }));
    expect((await register(regReq(grant(), goodPath), ctx())).status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("refuses a grant stored for another piece, or for another company", async () => {
    state.supabase = build({}, stored, grantRow({ content_piece_id: OTHER_PIECE }));
    expect((await register(regReq(grant(), goodPath), ctx())).status).toBe(403);
    state.supabase = build({}, stored, grantRow({ company_id: OTHER }));
    expect((await register(regReq(grant(), goodPath), ctx())).status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("refuses a link signed for another piece or company than the stored grant", async () => {
    state.supabase = build({}, stored);
    expect((await register(regReq(grant({ pieceId: OTHER_PIECE }), `${CO}/capture/${OTHER_PIECE}/talk.mov`), ctx())).status).toBe(403);
    expect((await register(regReq(grant({ companyId: OTHER }), goodPath), ctx())).status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("refuses another company's piece and writes nothing", async () => {
    state.supabase = build({ content_pieces: { data: { id: PIECE, company_id: OTHER } } }, stored);
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(404);
    expect(inserted()).toBe(false);
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

  it("refuses a storage path that already has a row, and does not count a use", async () => {
    const row = grantRow();
    state.supabase = build({ content_assets: { data: [{ id: "earlier" }] } }, stored, row);
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(409);
    expect(inserted()).toBe(false);
    expect(row.use_count).toBe(0);
    // The check is scoped to the piece (content_assets has no company_id) and to the exact path.
    const eqs = state.supabase.calls.filter((c) => c.table === "content_assets" && c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["content_piece_id", PIECE]);
    expect(eqs).toContainEqual(["storage_path", goodPath]);
  });

  it("refuses a stored file with an empty type, and does not trust the type the phone claims", async () => {
    const row = grantRow();
    state.supabase = build({}, { list: { data: [{ name: "talk.mov", metadata: { size: 5000, mimetype: "" } }] } }, row);
    const res = await register(regReq(grant(), goodPath, { mimeType: "video/mp4" }), ctx());
    expect(res.status).toBe(422);
    expect(inserted()).toBe(false);
    expect(row.use_count).toBe(0);
    state.supabase = build({}, { list: { data: [{ name: "talk.mov", metadata: { size: 5000 } }] } });
    expect((await register(regReq(grant(), goodPath, { mimeType: "video/mp4" }), ctx())).status).toBe(422);
  });

  it("refuses a stored file with no size, and does not trust the size the phone claims", async () => {
    state.supabase = build({}, { list: { data: [{ name: "talk.mov", metadata: { mimetype: "video/quicktime" } }] } });
    const res = await register(regReq(grant(), goodPath, { sizeBytes: 1000 }), ctx());
    expect(res.status).toBe(422);
    expect(inserted()).toBe(false);
  });

  it("refuses every capture upload when no dedicated secret is set", async () => {
    const link = grant();
    delete process.env.CAPTURE_LINK_SECRET;
    process.env.STAFF_UPLOAD_SALT = SECRET;
    state.supabase = build({}, stored);
    expect((await register(regReq(link, goodPath), ctx())).status).toBe(403);
    expect(inserted()).toBe(false);
  });

  it("fails closed, not open, while the capture_grants table does not exist", async () => {
    state.supabase = build({ capture_grants: grantsTable(null, { error: true }) }, stored);
    const res = await register(regReq(grant(), goodPath), ctx());
    expect(res.status).toBe(503);
    expect(inserted()).toBe(false);
  });
});

describe("capture link: minting and withdrawing", () => {
  it("stores a 48 hour, 3 use grant and returns a link that verifies to its id", async () => {
    state.supabase = build();
    const result = await mintCaptureGrant(state.supabase.client as never, { companyId: CO, pieceId: PIECE, createdBy: "u1" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const insert = state.supabase.calls.find((c) => c.table === "capture_grants" && c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ company_id: CO, content_piece_id: PIECE, max_uses: 3, created_by: "u1" });
    expect(Date.parse(insert.expires_at as string)).toBe(NOW + CAPTURE_LINK_TTL_SECONDS * 1000);
    expect(verifyCaptureGrant(result.grant, SECRET, NOW + 1000)).toEqual({ companyId: CO, pieceId: PIECE, grantId: insert.id });
  });

  it("will not mint without the dedicated secret, even when the IP salt is set", async () => {
    delete process.env.CAPTURE_LINK_SECRET;
    process.env.STAFF_UPLOAD_SALT = SECRET;
    state.supabase = build();
    const result = await mintCaptureGrant(state.supabase.client as never, { companyId: CO, pieceId: PIECE }, NOW);
    expect(result.ok).toBe(false);
    expect(state.supabase.calls.some((c) => c.table === "capture_grants")).toBe(false);
  });

  it("will not mint for a piece of another company, and does not mint when the table is missing", async () => {
    state.supabase = build({ content_pieces: { data: { id: PIECE, company_id: OTHER } } });
    expect((await mintCaptureGrant(state.supabase.client as never, { companyId: CO, pieceId: PIECE }, NOW)).ok).toBe(false);
    state.supabase = build({ capture_grants: { error: { message: "relation does not exist", code: "42P01" } } });
    const r = await mintCaptureGrant(state.supabase.client as never, { companyId: CO, pieceId: PIECE }, NOW);
    expect(r.ok).toBe(false);
  });

  it("withdraws grants scoped to the company", async () => {
    state.supabase = build();
    expect(await revokeCaptureGrants(state.supabase.client as never, CO, { pieceId: PIECE })).toBe(true);
    const calls = state.supabase.calls.filter((c) => c.table === "capture_grants");
    expect(calls.find((c) => c.method === "update")?.args[0]).toEqual({ revoked: true });
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toContainEqual(["company_id", CO]);
    expect(await revokeCaptureGrants(state.supabase.client as never, CO, {})).toBe(false);
  });
});
