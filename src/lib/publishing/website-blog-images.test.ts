import { describe, it, expect } from "vitest";
import { buildBlogMdx, inArticleImageNumber, mdxBody } from "./website-blog";

const body = `# The Quiet Launch
[[image: hero]]

An opening line.

## A section

Some words here.
[[image: 1]]

## Another section

IMAGE PLACEMENT: HERO IMAGE
More words, and a stray [[image: 3]] inside a line.
[[image: 2]]

The close.`;

describe("mdxBody image slots", () => {
  it("turns a numbered slot into its image, drops the hero slot and any slot without an image", () => {
    const out = mdxBody(body, "The Quiet Launch", { "1": "/images/blog/the-quiet-launch-1.jpg" });
    expect(out).toContain("Some words here.\n![](/images/blog/the-quiet-launch-1.jpg)\n\n## Another section");
    expect(out).not.toContain("[[image");
    expect(out).not.toContain("hero]]");
    expect(out).not.toContain("IMAGE PLACEMENT");
    expect(out).toContain("More words, and a stray  inside a line.");
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.startsWith("An opening line.")).toBe(true);
  });

  it("changes nothing for a body with no slots", () => {
    expect(mdxBody("# T\n\nPlain {text} <b>", "T")).toBe("Plain \\{text\\} \\<b>\n");
  });

  it("carries the image map through buildBlogMdx", () => {
    const mdx = buildBlogMdx({
      slug: "the-quiet-launch", title: "The Quiet Launch", seoTitle: "s", description: "d", date: "2026-09-28",
      readTime: "9 min read", author: "Michael Colling-Tuck", heroImage: "/images/blog/the-quiet-launch.png", ctaCluster: "launch",
    }, body, { "2": "/images/blog/the-quiet-launch-2.png" });
    expect(mdx).toContain("![](/images/blog/the-quiet-launch-2.png)");
    expect(mdx).not.toContain("the-quiet-launch-1");
  });
});

describe("inArticleImageNumber", () => {
  it("reads the slot number from an image's archetype", () => {
    expect(inArticleImageNumber("in_article_image_prompt_2")).toBe(2);
    expect(inArticleImageNumber("hero_image_prompt")).toBeNull();
    expect(inArticleImageNumber(null)).toBeNull();
  });
});
