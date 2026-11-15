import { describe, expect, it } from "vitest";
import { buildBlogMdx, escapeAlt, mdxBody } from "./website-blog";

const body = "# T\n\nOpening.\n\n[[image: 1]]\n\nThe end.";

describe("mdxBody alt text", () => {
  it("writes the alt text of an inline image", () => {
    expect(mdxBody(body, "T", { "1": { src: "/images/blog/t-1.png", alt: "A chart of launch timing" } }))
      .toBe("Opening.\n\n![A chart of launch timing](/images/blog/t-1.png)\n\nThe end.\n");
  });

  it("writes ![](src), exactly as before, when there is no alt", () => {
    const plain = mdxBody(body, "T", { "1": "/images/blog/t-1.png" });
    expect(plain).toBe("Opening.\n\n![](/images/blog/t-1.png)\n\nThe end.\n");
    expect(mdxBody(body, "T", { "1": { src: "/images/blog/t-1.png" } })).toBe(plain);
    expect(mdxBody(body, "T", { "1": { src: "/images/blog/t-1.png", alt: "  " } })).toBe(plain);
  });

  it("escapes alt text that would break the markdown or the MDX", () => {
    const out = mdxBody(body, "T", {
      "1": { src: "/images/blog/t-1.png", alt: "Costs [draft]\nin {GBP} <Widget> and a back\\slash" },
    });
    expect(out).toContain("![Costs \\[draft\\] in \\{GBP\\} \\<Widget> and a back\\\\slash](/images/blog/t-1.png)");
    // Still one image line, closed where it should be.
    expect(out.split("\n").filter(l => l.startsWith("![")).length).toBe(1);
  });

  it("escapes brackets, backslashes and line breaks", () => {
    expect(escapeAlt("a]b[c\\d\r\ne")).toBe("a\\]b\\[c\\\\d e");
  });

  it("carries the alt through buildBlogMdx", () => {
    const mdx = buildBlogMdx({
      slug: "t", title: "T", seoTitle: "T", description: "D", date: "2026-11-15", readTime: "1 min read",
      author: "Example Person", ctaCluster: "",
    }, body, { "1": { src: "/images/blog/t-1.png", alt: "What it shows" } });
    expect(mdx).toContain("![What it shows](/images/blog/t-1.png)");
  });
});
