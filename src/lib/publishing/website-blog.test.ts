import { describe, it, expect } from "vitest";
import { buildBlogMdx, imageExt, mdxBody, publishProblems, readTimeFor, slugify } from "./website-blog";

describe("slugify", () => {
  it("makes the site's lowercase hyphenated slugs", () => {
    expect(slugify("The Market Entry Assumption Nobody Checks")).toBe("the-market-entry-assumption-nobody-checks");
    expect(slugify("  Sales & Marketing, Again! ")).toBe("sales-and-marketing-again");
  });
});

describe("buildBlogMdx", () => {
  const fm = {
    slug: "a-post", title: 'The "Quiet" Launch', seoTitle: "The Quiet Launch", description: "Two sentences.",
    date: "2026-09-25", readTime: readTimeFor(2100), author: "Michael Colling-Tuck",
    heroImage: "/images/blog/a-post.png", ogImage: "/images/blog/a-post-og.png", ctaCluster: "launch",
  };

  it("writes the frontmatter the site's loader reads, in its order", () => {
    const mdx = buildBlogMdx(fm, "Opening line.\n\n## A section\n\nMore.");
    expect(mdx.startsWith("---\nslug: a-post\ntitle: \"The \\\"Quiet\\\" Launch\"\n")).toBe(true);
    expect(mdx).toContain("readTime: 9 min read\n");
    expect(mdx).toContain("heroImage: /images/blog/a-post.png\nogImage: /images/blog/a-post-og.png\nctaCluster: launch\n---\n\nOpening line.");
  });

  it("leaves out images that were not made", () => {
    expect(buildBlogMdx({ ...fm, ogImage: null }, "Body")).not.toContain("ogImage");
  });
});

describe("mdxBody", () => {
  it("drops a repeated H1 title and escapes what MDX would read as code or components", () => {
    expect(mdxBody("# The Title\n\nUse {budget} and <Widget> but 3 < 5.", "The Title"))
      .toBe("Use \\{budget\\} and \\<Widget> but 3 < 5.\n");
  });
});

describe("imageExt", () => {
  it("keeps the source format", () => {
    expect(imageExt("https://x.supabase.co/a/b.JPEG?t=1")).toBe("jpg");
    expect(imageExt("https://x/a.webp")).toBe("webp");
    expect(imageExt("https://x/a")).toBe("png");
  });
});

describe("publishProblems", () => {
  const ok = { approved: true, contentType: "blog_article", title: "A Title", body: "Body.", slug: "a", ctaCluster: "launch", heroUrl: "https://x/h.png" };
  it("passes an approved blog with a slug, a cluster and a hero", () => {
    expect(publishProblems(ok)).toEqual([]);
  });
  it("names each thing in the way", () => {
    expect(publishProblems({ ...ok, approved: false, ctaCluster: "nope", heroUrl: null, body: "A — B" })).toEqual([
      "Approve the blog first.",
      "Choose the service the blog points readers to.",
      "The blog contains an em or en dash; edit it out first.",
      "Generate the hero image first; every post on the site carries one.",
    ]);
  });
});
