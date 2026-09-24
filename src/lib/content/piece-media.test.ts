import { describe, it, expect } from "vitest";
import { resolvePieceMedia } from "./piece-media";

const piece = { title: "The handoff", cover_image_url: null as string | null };

describe("resolvePieceMedia", () => {
  it("a rendered video is the post, even when images exist", () => {
    const m = resolvePieceMedia(piece, [{ public_url: "img.png" }], [
      { asset_type: "custom", file_url: "clip.mp4", asset_metadata: { type: "rendered_video" } },
    ]);
    expect(m).toEqual({ shape: "video", items: [{ kind: "video", url: "clip.mp4", alt: "The handoff" }] });
  });

  it("uses content_images in sort order, several make a multi-image post", () => {
    const m = resolvePieceMedia(piece, [{ public_url: "b.png", sort_order: 1 }, { public_url: "a.png", sort_order: 0 }]);
    expect(m.shape).toBe("images");
    expect(m.items.map((i) => i.url)).toEqual(["a.png", "b.png"]);
  });

  it("falls back to the Mac's cover image, then to an image asset (the meme case)", () => {
    expect(resolvePieceMedia({ ...piece, cover_image_url: "card.png" }).items[0].url).toBe("card.png");
    const m = resolvePieceMedia(piece, [], [{ asset_type: "featured_image", file_url: "asset.png", text_content: "Nobody: / Sales:" }]);
    expect(m).toEqual({ shape: "image", items: [{ kind: "image", url: "asset.png", alt: "Nobody: / Sales:" }] });
  });

  it("a PDF guide is a document; a text post has no media", () => {
    expect(resolvePieceMedia(piece, [], [{ asset_type: "pdf_file", file_url: "g.pdf" }]).shape).toBe("document");
    expect(resolvePieceMedia(piece)).toEqual({ shape: "none", items: [] });
  });
});
