import { describe, it, expect } from "vitest";
import { assetRowsFor, saveAssets, STORED_ASSET_TYPES } from "./save-assets";

describe("assetRowsFor", () => {
  it("keeps the blog's SEO assets and image prompts under their own types", () => {
    const rows = assetRowsFor("p1", [
      { assetType: "seo_title", textContent: "A title" },
      { assetType: "url_slug", textContent: "a-title" },
      { assetType: "hero_image_prompt", textContent: "A clinic corridor at dawn" },
      { assetType: "in_article_image_prompt_2", textContent: "A procurement meeting" },
    ]);
    expect(rows.map(r => r.asset_type)).toEqual(["seo_title", "url_slug", "hero_image_prompt", "in_article_image_prompt_2"]);
  });

  it("stores a type the table does not know as custom, keeping its name", () => {
    const [row] = assetRowsFor("p1", [{ assetType: "carousel_prompt", textContent: "x" }]);
    expect(row).toMatchObject({ asset_type: "custom", asset_metadata: { original_type: "carousel_prompt" } });
  });

  it("adds the primary image prompt once, and drops empty assets", () => {
    const rows = assetRowsFor("p1", [{ assetType: "excerpt", textContent: "  " }], "A photo");
    expect(rows).toEqual([expect.objectContaining({ asset_type: "image_prompt", text_content: "A photo" })]);
    expect(assetRowsFor("p1", [{ assetType: "image_prompt", textContent: "Own" }], "Other")).toHaveLength(1);
  });

  it("only ever produces types migration 039 allows", () => {
    const rows = assetRowsFor("p1", [{ assetType: "anything_new", textContent: "x" }, { assetType: "seo_title", textContent: "y" }], "z");
    expect(rows.every(r => STORED_ASSET_TYPES.has(r.asset_type))).toBe(true);
  });
});

describe("saveAssets", () => {
  const db = (error: { message: string } | null) => ({ from: () => ({ insert: async () => ({ error }) }) });
  it("reports an insert error rather than swallowing it", async () => {
    expect(await saveAssets(db({ message: "violates check" }), assetRowsFor("p", [{ assetType: "seo_title", textContent: "t" }]))).toBe("violates check");
    expect(await saveAssets(db(null), assetRowsFor("p", [{ assetType: "seo_title", textContent: "t" }]))).toBeNull();
    expect(await saveAssets(db({ message: "never called" }), [])).toBeNull();
  });
});
