import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { blogImagesWorld, callsBeyondPiece } from "@/test/blog-images-world";

/**
 * The blog image record routes (15 Nov 2026) keep to the caller's company.
 * Two companies, A and B; the caller belongs to A. An unknown piece and
 * another company's piece answer the same 404, and nothing beyond the piece
 * itself is read or written for either.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PIECE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PIECE_A2 = "aaaaaaaa-0000-4000-8000-000000000002";
const PIECE_B = "bbbbbbbb-0000-4000-8000-000000000001";
const SOCIAL_A = "aaaaaaaa-0000-4000-8000-000000000003";

const state: { user: Record<string, unknown> | null; world: ReturnType<typeof blogImagesWorld> } = {
  user: null,
  world: blogImagesWorld(),
};

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  requireAdmin: async () => (state.user?.role === "admin" ? state.user : null),
  getSignedInProfile: async () => state.user,
  createAdminSupabaseClient: async () => state.world.client,
}));

import { GET, PATCH, POST } from "./content/[pieceId]/blog-images/route";

const blog = (id: string, company: string) => ({ id, company_id: company, content_type: "blog_article", title: "Example blog", markdown_body: "Words\n\n[[image: 1]]" });
const freshWorld = () => blogImagesWorld({
  pieces: [blog(PIECE_A, A), blog(PIECE_A2, A), blog(PIECE_B, B), { ...blog(SOCIAL_A, A), content_type: "social_post" }],
  images: [
    { id: "hero-a", content_piece_id: PIECE_A, archetype: "hero_image_prompt", public_url: "https://example.com/a-hero.png", sort_order: 0 },
    { id: "hero-a2", content_piece_id: PIECE_A2, archetype: "hero_image_prompt", public_url: "https://example.com/a2-hero.png", sort_order: 0 },
    { id: "hero-b", content_piece_id: PIECE_B, archetype: "hero_image_prompt", public_url: "https://example.com/b-hero.png", sort_order: 0 },
  ],
});

const ctx = (pieceId: string) => ({ params: Promise.resolve({ pieceId }) });
const get = (pieceId: string) => GET(new Request(`http://x/api/content/${pieceId}/blog-images`), ctx(pieceId));
const patch = (pieceId: string, body: Record<string, unknown>) => PATCH(new Request(`http://x/api/content/${pieceId}/blog-images`, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), ctx(pieceId));
let png: Buffer;
const post = (pieceId: string) => {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "share.png");
  return POST(new Request(`http://x/api/content/${pieceId}/blog-images`, { method: "POST", body: form }), ctx(pieceId));
};
const saveBody = { imageId: "hero-a", record: { type: "diagram", passage: "The opening" } };

const methods: Array<[string, (pieceId: string) => Promise<Response>]> = [
  ["GET", get],
  ["PATCH", (id) => patch(id, saveBody)],
  ["POST", post],
];

async function snapshot(res: Response) {
  return { status: res.status, body: await res.text(), type: res.headers.get("content-type") };
}

beforeEach(async () => {
  png ??= await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#336699" } }).png().toBuffer();
  state.user = { id: "u-a", role: "client", company_id: A };
  state.world = freshWorld();
});

describe.each(methods)("%s /api/content/[pieceId]/blog-images", (_name, call) => {
  it("answers an unknown piece and company B's piece with byte-identical 404s, and touches nothing else", async () => {
    const unknown = await snapshot(await call("cccccccc-0000-4000-8000-000000000009"));
    expect(callsBeyondPiece(state.world)).toEqual([]);
    state.world = freshWorld();
    const other = await snapshot(await call(PIECE_B));
    expect(callsBeyondPiece(state.world)).toEqual([]);
    expect(unknown.status).toBe(404);
    expect(other).toEqual(unknown);
    expect(state.world.state.images.find(i => i.id === "hero-b")?.image_record).toBeUndefined();
  });

  it("answers a signed-out caller with the same 404, and touches nothing else", async () => {
    const unknown = await snapshot(await call("cccccccc-0000-4000-8000-000000000009"));
    state.user = null;
    state.world = freshWorld();
    const signedOut = await snapshot(await call(PIECE_A));
    expect(signedOut).toEqual(unknown);
    expect(callsBeyondPiece(state.world)).toEqual([]);
  });

  it("answers a piece that is not a blog with the same 404", async () => {
    const unknown = await snapshot(await call("cccccccc-0000-4000-8000-000000000009"));
    state.world = freshWorld();
    const social = await snapshot(await call(SOCIAL_A));
    expect(social).toEqual(unknown);
    expect(callsBeyondPiece(state.world)).toEqual([]);
  });

  it("lets a client user of company A use it on A's own blog piece", async () => {
    const res = await call(PIECE_A);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images.some((i: { id: string }) => i.id === "hero-a")).toBe(true);
    expect(body.report.checks.length).toBe(8);
  });
});

describe("PATCH with an image from another piece", () => {
  it("is 404 for an image of another piece in the same company, and writes nothing", async () => {
    const unknown = await snapshot(await patch(PIECE_A, { ...saveBody, imageId: "no-such-image" }));
    const res = await snapshot(await patch(PIECE_A, { ...saveBody, imageId: "hero-a2" }));
    expect(res).toEqual(unknown);
    expect(res.status).toBe(404);
    expect(state.world.calls.filter(c => c.method === "update")).toEqual([]);
    expect(state.world.state.images.find(i => i.id === "hero-a2")?.image_record).toBeUndefined();
  });

  it("is 404 for an image of another company's piece, and writes nothing", async () => {
    const unknown = await snapshot(await patch(PIECE_A, { ...saveBody, imageId: "no-such-image" }));
    const res = await snapshot(await patch(PIECE_A, { ...saveBody, imageId: "hero-b" }));
    expect(res).toEqual(unknown);
    expect(state.world.calls.filter(c => c.method === "update")).toEqual([]);
    expect(state.world.state.images.find(i => i.id === "hero-b")?.image_record).toBeUndefined();
  });

  it("reads the image only within the piece in the URL", async () => {
    await patch(PIECE_A, { ...saveBody, imageId: "hero-b" });
    const read = state.world.calls.filter(c => c.table === "content_images" && c.method === "eq").map(c => c.args);
    expect(read).toContainEqual(["content_piece_id", PIECE_A]);
  });
});

describe("the role in a PATCH body", () => {
  it("is ignored: the server sets it from where the image is used", async () => {
    const res = await patch(PIECE_A, { imageId: "hero-a", record: { role: "share", type: "photograph", passage: "Opening" } });
    expect(res.status).toBe(200);
    expect(state.world.state.images.find(i => i.id === "hero-a")?.image_record).toEqual({ role: "hero", type: "photograph", passage: "Opening" });
  });
});

describe("a client user of company A", () => {
  it("can read, save and upload on A's blog piece", async () => {
    expect((await get(PIECE_A)).status).toBe(200);
    expect((await patch(PIECE_A, saveBody)).status).toBe(200);
    const res = await post(PIECE_A);
    expect(res.status).toBe(200);
    const share = state.world.state.images.find(i => i.archetype === "share_card");
    expect(share?.content_piece_id).toBe(PIECE_A);
    expect(share?.storage_path).toMatch(new RegExp(`^images/${A}/${PIECE_A}/share-card-`));
  });

  it("leaves an admin able to use any company's blog piece", async () => {
    state.user = { id: "adm", role: "admin", company_id: null };
    expect((await get(PIECE_B)).status).toBe(200);
  });
});
