import { describe, expect, it } from "vitest";
import { blogReadingBlocks } from "./blog-reading";

const rows = [
  { id: "h", archetype: "hero_image_prompt", public_url: "https://s/h.jpg", image_record: { alt: "A desk" } },
  { id: "i1", archetype: "in_article_image_prompt_1", public_url: "https://s/1.png", image_record: { alt: "Four steps", caption: "Fees begin here." } },
  { id: "i2", archetype: "in_article_image_prompt_2", public_url: "https://s/2.png", image_record: null },
  { id: "s", archetype: "share_card", public_url: "https://s/og.jpg" },
];

const body = "# Title\n\nOpening.\n\n[[image: hero]]\n\nFirst.\n\n[[image: 1]]\n\nSecond.\n\n[[image: 3]]\n\n[INFOGRAPHIC: three cards]\n\nEnd.";

describe("blogReadingBlocks", () => {
  it("reads the blog in order: hero first, each inline image where its slot is, with its caption", () => {
    const { blocks } = blogReadingBlocks(body, rows);
    expect(blocks.map(b => b.kind)).toEqual(["image", "text", "image", "text", "missing", "missing", "text"]);
    expect(blocks[0]).toMatchObject({ kind: "image", role: "hero", src: "https://s/h.jpg", alt: "A desk", caption: "" });
    expect(blocks[1]).toEqual({ kind: "text", markdown: "# Title\n\nOpening.\n\nFirst." });
    expect(blocks[2]).toMatchObject({ kind: "image", role: "inline", n: 1, src: "https://s/1.png", alt: "Four steps", caption: "Fees begin here." });
    expect(blocks[4]).toEqual({ kind: "missing", label: "Image 3 is not attached yet." });
    expect(blocks[5]).toMatchObject({ kind: "missing" });
    expect((blocks[5] as { label: string }).label).toContain("will not publish");
  });

  it("lists an attached inline image the body never places", () => {
    const { unplaced } = blogReadingBlocks(body, rows);
    expect(unplaced.map(u => u.id)).toEqual(["i2"]);
  });

  it("never shows the share card in the article", () => {
    const { blocks, unplaced } = blogReadingBlocks(body, rows);
    expect([...blocks, ...unplaced].some(b => "src" in b && b.src === "https://s/og.jpg")).toBe(false);
  });

  it("says when the hero is missing", () => {
    const { blocks } = blogReadingBlocks("[[image: hero]]\n\nText.", []);
    expect(blocks[0]).toEqual({ kind: "missing", label: "The hero image is not attached yet." });
  });

  it("is just the text for a blog with no slots and no images", () => {
    expect(blogReadingBlocks("One.\n\nTwo.", []).blocks).toEqual([{ kind: "text", markdown: "One.\n\nTwo." }]);
  });
});
