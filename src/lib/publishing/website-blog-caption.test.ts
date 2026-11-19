import { describe, expect, it } from "vitest";
import { buildBlogMdx, escapeCaption, mdxBody } from "./website-blog";

const body = "# T\n\nOpening.\n\n[[image: 1]]\n\nThe end.";
const at = (slot: Parameters<typeof mdxBody>[2]) => mdxBody(body, "T", slot).split("\n")[2];

describe("mdxBody captions", () => {
  it("writes the caption as the image title, which the site shows under the image", () => {
    expect(at({ "1": { src: "/images/blog/t-1.png", alt: "Four steps", caption: "Fees begin at the fourth step." } }))
      .toBe('![Four steps](/images/blog/t-1.png "Fees begin at the fourth step.")');
  });

  it("writes a caption with no alt", () => {
    expect(at({ "1": { src: "/images/blog/t-1.png", caption: "Why it matters." } }))
      .toBe('![](/images/blog/t-1.png "Why it matters.")');
  });

  it("leaves the image untitled when there is no caption, as before", () => {
    expect(at({ "1": { src: "/images/blog/t-1.png", alt: "A", caption: "  " } })).toBe("![A](/images/blog/t-1.png)");
  });

  it("escapes quotes, backslashes and line breaks so the caption cannot close early", () => {
    expect(escapeCaption('She said "not yet"\nand \\ left')).toBe('She said \\"not yet\\" and \\\\ left');
    expect(at({ "1": { src: "/s.png", caption: 'A "quoted" word' } })).toBe('![](/s.png "A \\"quoted\\" word")');
  });

  it("escapes every \"<\" and every brace in a caption, once", () => {
    expect(at({ "1": { src: "/s.png", caption: "Rates < 5% and <b> {x}" } })).toBe('![](/s.png "Rates \\< 5% and \\<b> \\{x\\}")');
  });

  it("carries the caption through buildBlogMdx", () => {
    const mdx = buildBlogMdx({
      slug: "t", title: "T", seoTitle: "T", description: "d", date: "2026-11-19", readTime: "1 min read", author: "A", ctaCluster: "launch",
    }, body, { "1": { src: "/images/blog/t-1.png", alt: "Four steps", caption: "Fees begin here." } });
    expect(mdx).toContain('![Four steps](/images/blog/t-1.png "Fees begin here.")');
  });
});

describe("mdxBody placeholder lines", () => {
  it("never publishes an [INFOGRAPHIC ...] or [DIAGRAM ...] placeholder as text", () => {
    const out = mdxBody("Opening.\n\n[INFOGRAPHIC: diagram. Four steps in a row.]\n\n[DIAGRAM: three cards]\n\n[IMAGE: heroImage]\n\nEnd.", "T");
    expect(out).toBe("Opening.\n\nEnd.\n");
  });

  it("keeps a sentence that only mentions an infographic", () => {
    expect(mdxBody("The [INFOGRAPHIC] below shows it.", "T")).toBe("The [INFOGRAPHIC] below shows it.\n");
  });
});
