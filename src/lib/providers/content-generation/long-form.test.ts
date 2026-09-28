import { describe, it, expect } from "vitest";
import { buildContentPrompt, parseLongFormOutput } from "./anthropic";
import type { ContentGenerationInput } from "../index";

const base: ContentGenerationInput = {
  blueprintContent: "C2 Voice Character: dry, hedged. E3 sign-off: Enjoy this? Repost it.",
  topicTitle: "The rep's day",
  topicDescription: null,
  pillar: "Getting Products to Market",
  audienceTheme: "Accessing Your Audience",
  contentType: "blog_article",
  weekNumber: 0,
  spokespersonName: "Michael",
  postTypeSlug: "blog_article",
};

const article = `===ARTICLE===
# The Rep's Empty Diary
[[image: hero]]

"You can hire the best reps," a commercial director told me, "and their diaries still stay empty."

## The conventional response

More reps. (It won't help.)
[[image: 1]]
===END ARTICLE===
===META===
{
  "title": "The Rep's Empty Diary",
  "postType": "blog_article",
  "imagePrompt": "An empty hospital corridor",
  "assets": [
    { "assetType": "seo_title", "textContent": "Why the rep's diary stays empty" },
    { "assetType": "in_article_image_prompt_1", "textContent": "A reception desk" }
  ]
}
===END META===`;

describe("parseLongFormOutput", () => {
  it("keeps an article full of quotes and line breaks, with its metadata", () => {
    const out = parseLongFormOutput(article);
    expect(out.title).toBe("The Rep's Empty Diary");
    expect(out.markdownBody).toContain('"You can hire the best reps,"');
    expect(out.markdownBody).toContain("[[image: 1]]");
    expect(out.markdownBody).not.toContain("===");
    expect(out.firstComment).toBeNull();
    expect(out.wordCount).toBeGreaterThan(20);
    expect(out.imagePrompt).toBe("An empty hospital corridor");
    expect(out.assets.map(a => a.assetType)).toEqual(["seo_title", "in_article_image_prompt_1"]);
    expect(out.warnings).toBeUndefined();
  });

  it("says the article was cut off when the end marker never arrives", () => {
    expect(() => parseLongFormOutput(article.slice(0, 120))).toThrow(/cut off/);
  });

  it("keeps the article and warns when the metadata is broken or missing", () => {
    const broken = article.replace('"postType": "blog_article",', '"postType": "blog_article"');
    const out = parseLongFormOutput(broken);
    expect(out.title).toBe("The Rep's Empty Diary"); // from the heading
    expect(out.assets).toEqual([]);
    expect(out.warnings?.[0]).toMatch(/could not be read/);

    const none = parseLongFormOutput(article.slice(0, article.indexOf("===META===")));
    expect(none.warnings?.[0]).toMatch(/no metadata/);
  });

  it("reads metadata the model wrapped in code fences", () => {
    const fenced = article.replace("===META===\n{", "===META===\n```json\n{").replace("}\n===END META===", "}\n```\n===END META===");
    expect(parseLongFormOutput(fenced).assets).toHaveLength(2);
  });
});

describe("buildContentPrompt", () => {
  it("asks an article for markers, not JSON, and carries no LinkedIn sign-off or first comment", () => {
    const prompt = buildContentPrompt(base);
    expect(prompt).toContain("===ARTICLE===");
    expect(prompt).toContain("NO SIGN-OFF AND NO FIRST COMMENT");
    expect(prompt).not.toContain("Respond with a JSON object");
    expect(prompt).not.toContain("FIRST COMMENT RULES");
    expect(prompt).not.toContain("reproduce it VERBATIM");
    expect(prompt).toContain("up to four or five sentences");
  });

  it("puts the image brand context in front of the writer when the company has one", () => {
    expect(buildContentPrompt(base)).not.toContain("IMAGE BRAND CONTEXT");
    const withBrand = buildContentPrompt({ ...base, brandContext: "Muted teal, film grain, no stock smiles." });
    expect(withBrand).toContain("IMAGE BRAND CONTEXT (governs every image prompt you write)");
    expect(withBrand).toContain("Muted teal, film grain, no stock smiles.");
  });

  it("leaves a LinkedIn post exactly as it was", () => {
    const prompt = buildContentPrompt({ ...base, contentType: "social_post", postTypeSlug: "problem_post", signoffText: "Enjoy this? Repost it." });
    expect(prompt).toContain("Respond with a JSON object");
    expect(prompt).toContain("FIRST COMMENT RULES");
    expect(prompt).toContain('"Enjoy this? Repost it."');
    expect(prompt).toContain("1-2 sentence paragraphs for social posts");
    expect(prompt).not.toContain("===ARTICLE===");
  });
});
