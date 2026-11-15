import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { blogImagesWorld, type WorldImage } from "@/test/blog-images-world";

const A = "11111111-1111-4111-8111-111111111111";
const PIECE = "aaaaaaaa-0000-4000-8000-000000000001";

const state: { user: Record<string, unknown> | null; world: ReturnType<typeof blogImagesWorld> } = {
  user: null,
  world: blogImagesWorld(),
};

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async (companyId: string) =>
    state.user && (state.user.role === "admin" || state.user.company_id === companyId) ? state.user : null,
  createAdminSupabaseClient: async () => state.world.client,
}));

import { GET, PATCH, POST } from "./route";

const dash = (code: number) => String.fromCharCode(code);
const body = "Opening words.\n\n[[image: 1]]\n\nMore words.";
const world = (images: WorldImage[] = [], extra: { gateSettings?: Record<string, unknown>; writeError?: string } = {}) => blogImagesWorld({
  pieces: [{ id: PIECE, company_id: A, content_type: "blog_article", title: "Example blog", markdown_body: body }],
  images,
  ...extra,
});
const hero: WorldImage = { id: "hero", content_piece_id: PIECE, archetype: "hero_image_prompt", public_url: "https://example.com/hero.png", sort_order: 0 };
const inline: WorldImage = { id: "in1", content_piece_id: PIECE, archetype: "in_article_image_prompt_1", public_url: "https://example.com/in1.png", sort_order: 1 };
const cover: WorldImage = { id: "cover", content_piece_id: PIECE, archetype: "cover_image_prompt", public_url: "https://example.com/cover.png", sort_order: 2 };

const ctx = { params: Promise.resolve({ pieceId: PIECE }) };
const get = async () => GET(new Request("http://x"), ctx);
const patch = async (payload: Record<string, unknown>) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), ctx);
const upload = async (bytes: Buffer | Uint8Array, type = "image/png", name = "share.png") => {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type }), name);
  return POST(new Request("http://x", { method: "POST", body: form }), ctx);
};
const image = (width: number, height: number, format: "png" | "jpeg" | "webp" = "png") =>
  sharp({ create: { width, height, channels: 3, background: "#224466" } })[format]().toBuffer();
const recordOf = (id: string) => state.world.state.images.find(i => i.id === id)?.image_record;
const check = (json: { report: { checks: Array<{ code: string; passed: boolean; required: boolean; problems: string[] }> } }, code: string) =>
  json.report.checks.find(c => c.code === code)!;

beforeEach(() => {
  state.user = { id: "u-a", role: "client", company_id: A };
  state.world = world([hero, inline, cover]);
});

describe("GET", () => {
  it("returns the images as they would publish, the settings and the verdict", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.images.map((i: { id: string; label: string; publicUrl: string }) => [i.id, i.label, i.publicUrl])).toEqual([
      ["hero", "the hero image", "https://example.com/hero.png"], ["in1", "inline image 1", "https://example.com/in1.png"],
    ]);
    expect(json.legacyCover).toEqual({ id: "cover", publicUrl: "https://example.com/cover.png" });
    expect(json.unplaced).toEqual([]);
    expect(json.settings).toEqual({ photographTreatment: null, inlineImageWordLimit: 900, requireShareCard: true, enforceImageChecks: false });
    expect(json.report.checks).toHaveLength(8);
    expect(check(json, "records").passed).toBe(false);
  });

  it("reads the company's own gate settings", async () => {
    state.world = world([hero], { gateSettings: { [A]: { photographTreatment: "mono", enforceImageChecks: true } } });
    const json = await (await get()).json();
    expect(json.settings).toMatchObject({ photographTreatment: "mono", enforceImageChecks: true });
  });

  it("reflects saved records in the report", async () => {
    await patch({ imageId: "hero", record: { type: "diagram", passage: "Opening" } });
    await patch({ imageId: "in1", record: { type: "infographic", passage: "The middle", alt: "A chart of the steps" } });
    const json = await (await get()).json();
    expect(check(json, "records").passed).toBe(true);
    expect(check(json, "type").passed).toBe(true);
    expect(check(json, "alt").passed).toBe(true);
    expect(check(json, "share").passed).toBe(false);
  });
});

describe("PATCH", () => {
  it("saves the record with the role set from the archetype, and returns the fresh payload", async () => {
    const res = await patch({ imageId: "in1", record: { type: "photograph", passage: "  The middle  ", treatment: " mono ", alt: " Two people talking " } });
    expect(res.status).toBe(200);
    expect(recordOf("in1")).toEqual({ role: "inline", type: "photograph", passage: "The middle", treatment: "mono", alt: "Two people talking" });
    const json = await res.json();
    expect(json.images.find((i: { id: string }) => i.id === "in1").record.passage).toBe("The middle");
    const update = state.world.calls.find(c => c.table === "content_images" && c.method === "update");
    expect(update).toBeTruthy();
    const eqs = state.world.calls.filter(c => c.table === "content_images" && c.method === "eq").map(c => c.args);
    expect(eqs).toContainEqual(["id", "in1"]);
    expect(eqs).toContainEqual(["content_piece_id", PIECE]);
  });

  it("keeps fields the request leaves out and clears fields sent empty", async () => {
    state.world = world([{ ...hero, image_record: { role: "hero", type: "photograph", passage: "Old", treatment: "mono", alt: "Old alt" } }]);
    await patch({ imageId: "hero", record: { passage: "New", alt: "" } });
    expect(recordOf("hero")).toEqual({ role: "hero", type: "photograph", passage: "New", treatment: "mono" });
  });

  it.each([
    [{ type: "chart" }, "The type must be diagram, infographic or photograph."],
    [{ passage: 4 }, "The passage line must be text."],
    [{ passage: "x".repeat(301) }, "The passage line must be 300 characters or fewer."],
    [{ treatment: "x".repeat(61) }, "The treatment must be 60 characters or fewer."],
    [{ alt: "x".repeat(301) }, "The alt text must be 300 characters or fewer."],
  ])("refuses %j in plain words", async (record, message) => {
    const res = await patch({ imageId: "hero", record });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(state.world.calls.filter(c => c.method === "update")).toEqual([]);
  });

  it.each([0x2013, 0x2014])("refuses the long dash with code point %i in the passage or alt text", async (code) => {
    const passage = await patch({ imageId: "hero", record: { passage: `Before ${dash(code)} after` } });
    expect(passage.status).toBe(400);
    expect((await passage.json()).error).toBe("The passage line contains a long dash. Use a comma, full stop or brackets instead.");
    const alt = await patch({ imageId: "in1", record: { passage: "Fine", alt: `A ${dash(code)} B` } });
    expect(alt.status).toBe(400);
    expect((await alt.json()).error).toBe("The alt text contains a long dash. Use a comma, full stop or brackets instead.");
    expect(state.world.calls.filter(c => c.method === "update")).toEqual([]);
  });

  it.each([["null", "null"], ["an array", "[]"], ["a string", '"hero"'], ["a number", "7"], ["not JSON", "{"]])(
    "refuses a body that is %s with a plain 400", async (_name, raw) => {
      const res = await PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: raw }), ctx);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Send the image and its record to save." });
      expect(state.world.calls.filter(c => c.table === "content_images")).toEqual([]);
    });

  it("needs an image id and a record", async () => {
    expect((await patch({ record: { passage: "x" } })).status).toBe(400);
    const res = await patch({ imageId: "hero" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Send the record to save.");
  });

  it("refuses an image the publisher does not use", async () => {
    const res = await patch({ imageId: "cover", record: { passage: "x" } });
    expect(res.status).toBe(400);
    expect(state.world.calls.filter(c => c.method === "update")).toEqual([]);
  });

  it.each([
    ["RELEASE_LOCKED", 409, "This piece has already been published, so its images cannot be changed here."],
    ["RELEASE_BUSY", 409, "This piece is being published right now. Try again in a minute."],
    ["permission denied for table content_images", 500, "The change could not be saved. Try again in a minute."],
  ])("maps a write failure of %s to a plain sentence", async (message, status, sentence) => {
    state.world = world([hero], { writeError: `P0001: ${message}` });
    const res = await patch({ imageId: "hero", record: { passage: "x" } });
    expect(res.status).toBe(status);
    const json = await res.json();
    expect(json).toEqual({ error: sentence });
  });
});

describe("POST, the share image", () => {
  it("accepts a file of exactly 4 MB as far as the size check", async () => {
    const res = await upload(new Uint8Array(4 * 1024 * 1024), "image/png", "edge.png");
    expect(res.status).toBe(415);
  });

  it("shows the newest share image when two share_card rows are left", async () => {
    state.world = world([
      { id: "older", content_piece_id: PIECE, archetype: "share_card", public_url: "https://example.com/older.png", dimensions: "800x400", sort_order: 5, created_at: "2026-11-15T09:00:00Z" },
      { id: "newer", content_piece_id: PIECE, archetype: "share_card", public_url: "https://example.com/newer.png", dimensions: "1200x630", sort_order: 4, created_at: "2026-11-15T10:00:00Z" },
    ]);
    const json = await (await get()).json();
    expect(json.images.filter((i: { role: string }) => i.role === "share").map((i: { id: string }) => i.id)).toEqual(["newer"]);
    const select = state.world.calls.find(c => c.table === "content_images" && c.method === "select")!;
    expect(String(select.args[0])).toContain("created_at");
  });

  it("stores the file, measures it and records it as the share image", async () => {
    const res = await upload(await image(1200, 630));
    expect(res.status).toBe(200);
    const rows = state.world.state.images.filter(i => i.archetype === "share_card");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dimensions: "1200x630",
      image_record: { role: "share", passage: "The designed 1200x630 share card" },
      sort_order: 3,
    });
    expect(rows[0].storage_path).toMatch(new RegExp(`^images/${A}/${PIECE}/share-card-\\d+\\.png$`));
    expect(rows[0].public_url).toBe(`https://storage.example.com/content-assets/${rows[0].storage_path}`);
    const uploadCall = state.world.storageCalls.find(c => c.method === "upload")!;
    expect(uploadCall.table).toBe("content-assets");
    const json = await res.json();
    const share = json.images.find((i: { role: string }) => i.role === "share");
    expect([share.width, share.height]).toEqual([1200, 630]);
    expect(check(json, "share").passed).toBe(true);
  });

  it("stores a wrong size and lets the gate report it", async () => {
    const res = await upload(await image(1000, 500, "jpeg"), "image/jpeg", "share.jpg");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(state.world.state.images.find(i => i.archetype === "share_card")?.dimensions).toBe("1000x500");
    expect(state.world.state.images.find(i => i.archetype === "share_card")?.storage_path).toMatch(/\.jpg$/);
    expect(check(json, "share").problems).toContain('Blog "Example blog": the share image is 1000 by 500. Replace it with a 1200 by 630 card.');
  });

  it("replaces the previous share image, leaving one share_card row, and removes its stored file", async () => {
    const oldPath = `images/${A}/${PIECE}/share-card-1.png`;
    state.world = world([hero, { id: "old-share", content_piece_id: PIECE, archetype: "share_card", public_url: "https://example.com/old.png", storage_path: oldPath, dimensions: "800x400", sort_order: 4 }]);
    const res = await upload(await image(1200, 630, "webp"), "image/webp", "share.webp");
    expect(res.status).toBe(200);
    const rows = state.world.state.images.filter(i => i.archetype === "share_card");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe("old-share");
    expect(rows[0].dimensions).toBe("1200x630");
    expect(state.world.storageCalls.filter(c => c.method === "remove").map(c => c.args[0])).toEqual([[oldPath]]);
  });

  it("does not remove a stored file it did not put there", async () => {
    state.world = world([{ id: "old-share", content_piece_id: PIECE, archetype: "share_card", public_url: "https://example.com/x.png", storage_path: "elsewhere/x.png", sort_order: 1 }]);
    expect((await upload(await image(1200, 630))).status).toBe(200);
    expect(state.world.storageCalls.filter(c => c.method === "remove")).toEqual([]);
    expect(state.world.state.images.filter(i => i.archetype === "share_card")).toHaveLength(1);
  });

  it("refuses a missing file, another type, a file that is not an image and one over 4 MB", async () => {
    const empty = await POST(new Request("http://x", { method: "POST", body: new FormData() }), ctx);
    expect(empty.status).toBe(400);
    expect((await upload(Buffer.from("GIF89a"), "image/gif", "a.gif")).status).toBe(415);
    const fake = await upload(Buffer.from("not an image at all"), "image/png", "a.png");
    expect(fake.status).toBe(415);
    expect((await fake.json()).error).toBe("The share image must be a PNG, JPEG or WebP file.");
    const big = await upload(new Uint8Array(4 * 1024 * 1024 + 1), "image/png", "big.png");
    expect(big.status).toBe(413);
    expect((await big.json()).error).toBe("That file is too large. The share image must be 4 MB or smaller.");
    expect(state.world.storageCalls).toEqual([]);
    expect(state.world.calls.filter(c => c.method === "insert")).toEqual([]);
  });

  it.each([
    ["RELEASE_LOCKED", 409, "This piece has already been published, so its images cannot be changed here."],
    ["RELEASE_BUSY", 409, "This piece is being published right now. Try again in a minute."],
    ["duplicate key value", 500, "The change could not be saved. Try again in a minute."],
  ])("maps an insert failure of %s, and removes the file it stored", async (message, status, sentence) => {
    state.world = world([hero], { writeError: message });
    const res = await upload(await image(1200, 630));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: sentence });
    const stored = state.world.storageCalls.find(c => c.method === "upload")!.args[0];
    expect(state.world.storageCalls.find(c => c.method === "remove")?.args[0]).toEqual([stored]);
    expect(state.world.objects.size).toBe(0);
  });
});
