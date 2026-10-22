import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { ContentGenerationOutput } from "@/lib/providers";
import type { ProductionDb } from "./types";
import { parseProductionImageCopy, renderProductionGraphic, renderProductionImage } from "./render";

const company = { id: "company-a", name: "Sample venue", brand_color: "#A27BF9" };
const output = (copy: unknown): ContentGenerationOutput => ({
  title: "Caption title", markdownBody: "This caption must never be printed on the graphic.",
  firstComment: null, wordCount: 11, postType: "meme", imagePrompt: "Not a graphic",
  assets: [{ assetType: "image_copy", textContent: JSON.stringify(copy) }],
});
const meme = { title: "An excellent excuse to stay a little longer.", subtitle: "Your afternoon has room for a proper catch-up." };

function database() {
  const state = {
    piece: { id: "piece-a", company_id: company.id, approval_status: "pending", cover_image_url: null as string | null },
    existing: null as { public_url: string } | null,
    uploaded: null as Buffer | null,
    uploadError: null as { message: string; statusCode?: string } | null,
    imageError: null as { message: string } | null,
    coverError: null as { message: string } | null,
    updateReturned: true,
  };
  const filters: Array<{ table: string; method: string; args: unknown[] }> = [];
  const updates: unknown[] = [];
  const upload = vi.fn(async (_path: string, buffer: Buffer) => {
    state.uploaded = buffer;
    return { error: state.uploadError };
  });
  const upsert = vi.fn(async () => ({ error: state.imageError }));
  const from = vi.fn((table: string) => {
    let update = false;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "order", "limit"]) chain[method] = (...args: unknown[]) => {
      filters.push({ table, method, args }); return chain;
    };
    chain.update = (patch: unknown) => { update = true; updates.push(patch); return chain; };
    chain.upsert = upsert;
    chain.maybeSingle = async () => {
      if (update) return { data: state.updateReturned ? { id: state.piece.id } : null, error: state.coverError };
      return { data: table === "content_pieces" ? state.piece : state.existing, error: null };
    };
    return chain;
  });
  const db = { from, storage: { from: vi.fn(() => ({ upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }) })) } } as unknown as ProductionDb;
  const assertOwnership = vi.fn(async () => {});
  return { db, state, filters, updates, upload, upsert, assertOwnership };
}

beforeEach(() => vi.restoreAllMocks());

describe("hosted production image copy", () => {
  it("requires short structured copy rather than taking the entire caption or an image prompt", () => {
    const captionOnly = { ...output(meme), assets: [] };
    expect(() => parseProductionImageCopy(captionOnly, "meme")).toThrow("image_copy JSON");
    expect(() => parseProductionImageCopy(output({ title: "x".repeat(111) }), "meme")).toThrow("110 characters");
    expect(() => parseProductionImageCopy(output({ title: "A graphic", points: ["One point"] }), "mini_infographic")).toThrow("2 to 5");
    expect(() => parseProductionImageCopy(output({ title: "A graphic", points: ["A point", { html: "<img>" }] }), "mini_infographic")).toThrow("infographic point");
  });

  it("renders a genuine 1080 pixel PNG using bundled fonts without fetching company image URLs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Remote fetch must not happen"));
    const image = await renderProductionGraphic({ ...company, logo_url: "http://169.254.169.254/", profile_picture_url: "https://evil.example/" }, "meme", meme);
    expect(await sharp(image).metadata()).toMatchObject({ format: "png", width: 1080, height: 1080 });
    const stats = await sharp(image).extract({ left: 64, top: 280, width: 952, height: 500 }).stats();
    expect(stats.channels[0].stdev).toBeGreaterThan(25);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders infographic points into distinct readable rows, including the final point", async () => {
    const copy = { title: "Three ways to make room for a catch-up", points: ["Start with a shared plan.", "Leave space to stop and talk.", "Make the next date before you leave."], footer: "Small plans. Proper conversations." };
    const image = await renderProductionGraphic(company, "mini_infographic", copy);
    expect(await sharp(image).metadata()).toMatchObject({ format: "png", width: 1080, height: 1080 });
    const stats = await sharp(image).extract({ left: 142, top: 250, width: 850, height: 360 }).stats();
    expect(stats.channels[0].stdev).toBeGreaterThan(20);
    const differentPoints = await renderProductionGraphic(company, "mini_infographic", { ...copy, points: ["Start with a shared plan.", "Leave space to stop and talk.", "A completely different final point."] });
    expect(image.equals(differentPoints)).toBe(false);
  });
});

describe("production image persistence", () => {
  it("leaves unsupported formats to their existing production path", async () => {
    const f = database();
    expect(await renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "blog_teaser", output: output(meme) })).toBeUndefined();
    expect(f.assertOwnership).not.toHaveBeenCalled();
  });

  it("records a generated image and cover with immutable company and piece scoped storage", async () => {
    const f = database();
    const url = await renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) });
    expect(url).toMatch(/images\/company-a\/piece-a\/api-meme-[a-f0-9]+\.png$/);
    expect(f.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { contentType: "image/png", upsert: false, cacheControl: "31536000" });
    expect(f.upsert).toHaveBeenCalledWith(expect.objectContaining({ content_piece_id: "piece-a", dimensions: "1080x1080", public_url: url }), { onConflict: "id", ignoreDuplicates: true });
    expect(f.updates).toEqual([{ cover_image_url: url, image_generation_status: "completed" }]);
    expect(f.filters).toEqual(expect.arrayContaining([
      { table: "content_pieces", method: "eq", args: ["company_id", "company-a"] },
      { table: "content_pieces", method: "neq", args: ["approval_status", "approved"] },
      { table: "content_pieces", method: "is", args: ["cover_image_url", null] },
    ]));
    expect(f.assertOwnership).toHaveBeenCalledTimes(4);
  });

  it("uses the existing asset on retry without rendering or uploading again", async () => {
    const f = database(); f.state.existing = { public_url: "https://storage.example/existing.png" };
    expect(await renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: { ...output(meme), assets: [] } })).toBe(f.state.existing.public_url);
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it("never overwrites an approved asset", async () => {
    const f = database(); f.state.piece.approval_status = "approved"; f.state.piece.cover_image_url = "https://storage.example/approved.png";
    expect(await renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) })).toBe(f.state.piece.cover_image_url);
    expect(f.upload).not.toHaveBeenCalled(); expect(f.upsert).not.toHaveBeenCalled(); expect(f.updates).toEqual([]);
  });

  it("refuses a piece belonging to a different company", async () => {
    const f = database(); f.state.piece.company_id = "company-b";
    await expect(renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) })).rejects.toThrow("cannot access");
    expect(f.upload).not.toHaveBeenCalled();
  });

  it("stops before storage if the worker lease has expired", async () => {
    const f = database(); f.assertOwnership.mockResolvedValueOnce().mockRejectedValueOnce(new Error("Lease expired"));
    await expect(renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) })).rejects.toThrow("Lease expired");
    expect(f.upload).not.toHaveBeenCalled(); expect(f.upsert).not.toHaveBeenCalled();
  });

  it.each(["upload", "record", "cover"])("propagates a %s failure rather than reporting a completed image", async (stage) => {
    const f = database();
    if (stage === "upload") f.state.uploadError = { message: "Storage unavailable" };
    if (stage === "record") f.state.imageError = { message: "Database unavailable" };
    if (stage === "cover") f.state.coverError = { message: "Cover unavailable" };
    await expect(renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) })).rejects.toThrow(/Could not/);
  });

  it("recovers an immutable upload already present after an interruption", async () => {
    const f = database(); f.state.uploadError = { statusCode: "409", message: "The resource already exists" };
    await expect(renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) })).resolves.toMatch(/api-meme-/);
  });

  it("does not replace a cover if approval or another editor changed the piece during rendering", async () => {
    const f = database(); f.state.updateReturned = false;
    await expect(renderProductionImage({ ...f, company, pieceId: "piece-a", postTypeSlug: "meme", output: output(meme) })).rejects.toThrow("Post changed");
  });
});
