import { describe, expect, it } from "vitest";
import { blogImagesForGate, imageSlotKeys, parseDimensions, roleForArchetype, type BlogImageRow } from "./blog-gate-input";

const row = (id: string, archetype: string | null, extra: Partial<BlogImageRow> = {}): BlogImageRow => ({
  id, archetype, public_url: `https://example.com/storage/${id}.png`, filename: `${id}.png`, dimensions: null, image_record: null, ...extra,
});

describe("parseDimensions", () => {
  it.each(["1200x630", "1200 x 630", "1200X630", `1200${String.fromCharCode(0xd7)}630`, " 1200 x 630 "])("reads %s", (v) => {
    expect(parseDimensions(v)).toEqual({ width: 1200, height: 630 });
  });
  it.each([null, undefined, "", "wide", "1200", "1200x", "0x630", "1200x630px", "12.5x6"])("gives null for %s", (v) => {
    expect(parseDimensions(v as string | null | undefined)).toBeNull();
  });
});

describe("imageSlotKeys", () => {
  it("reads only slots on their own line", () => {
    const body = "Intro\n[[image: 1]]\nText with [[image: 2]] inside\n  [[ IMAGE: 3 ]]  \r\n[[image: hero]]";
    expect([...imageSlotKeys(body)].sort()).toEqual(["1", "3", "hero"]);
  });
});

describe("roleForArchetype", () => {
  it("maps the publishing archetypes", () => {
    expect(roleForArchetype("hero_image_prompt")).toBe("hero");
    expect(roleForArchetype("in_article_image_prompt_2")).toBe("inline");
    expect(roleForArchetype("share_card")).toBe("share");
    expect(roleForArchetype("cover_image_prompt")).toBeNull();
    expect(roleForArchetype("uploaded")).toBeNull();
    expect(roleForArchetype(null)).toBeNull();
  });
});

describe("blogImagesForGate", () => {
  it("takes the hero from hero_image_prompt with its label, record and size", () => {
    const { images } = blogImagesForGate([
      row("h", "hero_image_prompt", { dimensions: "1600x1200", image_record: { type: "photograph", passage: "Opening" } }),
    ], "Body");
    expect(images).toEqual([{
      id: "h", label: "the hero image", role: "hero", file: "https://example.com/storage/h.png",
      record: { type: "photograph", passage: "Opening" }, width: 1600, height: 1200, publicUrl: "https://example.com/storage/h.png",
    }]);
  });

  it("uses the first hero row when there are two, as the publisher does", () => {
    const { images } = blogImagesForGate([row("h1", "hero_image_prompt"), row("h2", "hero_image_prompt")], "");
    expect(images.map(i => i.id)).toEqual(["h1"]);
  });

  it("gates an inline image only when the body has its slot on its own line", () => {
    const rows = [row("i1", "in_article_image_prompt_1"), row("i2", "in_article_image_prompt_2"), row("i3", "in_article_image_prompt_3")];
    const out = blogImagesForGate(rows, "Para\n\n[[image: 1]]\n\nSee [[image: 2]] here\n\n[[image: 3]]");
    expect(out.images.map(i => [i.id, i.label, i.role, i.n])).toEqual([
      ["i1", "inline image 1", "inline", 1], ["i3", "inline image 3", "inline", 3],
    ]);
    expect(out.unplaced).toEqual([{ id: "i2", n: 2, label: "inline image 2", publicUrl: "https://example.com/storage/i2.png" }]);
  });

  it("orders inline images by number and keeps the last row for a repeated number", () => {
    const rows = [row("b", "in_article_image_prompt_2"), row("a", "in_article_image_prompt_1"), row("b2", "in_article_image_prompt_2")];
    const out = blogImagesForGate(rows, "[[image: 1]]\n[[image: 2]]");
    expect(out.images.map(i => i.id)).toEqual(["a", "b2"]);
  });

  it("takes the share image from share_card, never from the cover picture", () => {
    const out = blogImagesForGate([
      row("c", "cover_image_prompt", { dimensions: "1200x630" }),
      row("s", "share_card", { dimensions: "1200 x 630", image_record: { role: "share", passage: "The card" } }),
    ], "");
    expect(out.images.map(i => [i.id, i.label, i.role, i.width, i.height])).toEqual([["s", "the share image", "share", 1200, 630]]);
    expect(out.legacyCover).toEqual({ id: "c", publicUrl: "https://example.com/storage/c.png" });
  });

  it("reports a cover picture with no share image as a legacy cover only", () => {
    const out = blogImagesForGate([row("c", "cover_image_prompt")], "");
    expect(out.images).toEqual([]);
    expect(out.legacyCover?.id).toBe("c");
  });

  it("leaves out images the publisher does not use, and parses records safely", () => {
    const out = blogImagesForGate([
      row("u", "uploaded"), row("b", "bank_photo"),
      row("h", "hero_image_prompt", { image_record: "not json" }),
    ], "");
    expect(out.images.map(i => [i.id, i.record])).toEqual([["h", null]]);
    expect(out.unplaced).toEqual([]);
    expect(out.legacyCover).toBeNull();
  });

  it("gives null sizes when the dimensions cannot be read", () => {
    const out = blogImagesForGate([row("s", "share_card", { dimensions: "large" })], "");
    expect([out.images[0].width, out.images[0].height]).toEqual([null, null]);
  });

  it("puts the hero first, then inline images, then the share image", () => {
    const out = blogImagesForGate([
      row("s", "share_card"), row("i", "in_article_image_prompt_1"), row("h", "hero_image_prompt"),
    ], "[[image: 1]]");
    expect(out.images.map(i => i.role)).toEqual(["hero", "inline", "share"]);
  });
});
