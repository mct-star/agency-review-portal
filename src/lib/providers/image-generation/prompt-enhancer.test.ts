import { describe, it, expect, vi, afterEach } from "vitest";
import { enhanceImagePrompt, isEditorialStyle } from "./prompt-enhancer";

afterEach(() => vi.unstubAllGlobals());

describe("isEditorialStyle", () => {
  it("sends blog images and photographic styles to the editorial prompt", () => {
    for (const s of ["hero_image_prompt", "cover_image_prompt", "in_article_image_prompt_2", "editorial_photography"]) {
      expect(isEditorialStyle(s)).toBe(true);
    }
  });
  it("leaves social styles on the Pixar prompt", () => {
    for (const s of [undefined, "pixar_3d", "quote_card", "general"]) expect(isEditorialStyle(s)).toBe(false);
  });
});

describe("enhanceImagePrompt", () => {
  it("uses the editorial system prompt for a blog hero", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: "x".repeat(80) }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await enhanceImagePrompt("A quiet hospital corridor", "hero_image_prompt", "key");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.system).toContain("Photorealistic editorial photograph");
    expect(body.system).not.toContain("Pixar 3D animated film style");
  });
});
