import { describe, it, expect } from "vitest";
import { markdownToNewsletterHtml, buildNewsletterCopy } from "./newsletter-copy";

describe("markdownToNewsletterHtml", () => {
  it("keeps headings and paragraphs as real elements", () => {
    const html = markdownToNewsletterHtml("# Title\n\nFirst para.\nSame para.\n\n## Part two\n\nSecond para.");
    expect(html).toBe("<h1>Title</h1><p>First para. Same para.</p><h2>Part two</h2><p>Second para.</p>");
  });

  it("keeps lists, bold, italic and links", () => {
    const html = markdownToNewsletterHtml("- one **bold**\n- two *soft*\n\nSee [AGENCY](https://agencymedicalmarketing.com).");
    expect(html).toContain("<ul><li>one <strong>bold</strong></li><li>two <em>soft</em></li></ul>");
    expect(html).toContain('<a href="https://agencymedicalmarketing.com">AGENCY</a>');
  });

  it("escapes raw html and refuses javascript links", () => {
    const html = markdownToNewsletterHtml("<script>x</script> [bad](javascript:alert(1))");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
  });
});

describe("buildNewsletterCopy", () => {
  it("returns title, body (html and plain) and image as separate copy blocks", () => {
    const c = buildNewsletterCopy({
      title: "Why launches stall",
      markdown_body: "# Why launches stall\n\nIt is not a sales problem.\n\n## The fix\n\nStart earlier.",
      imageUrl: "https://example.com/hero.png",
    });
    expect(c.title).toBe("Why launches stall");
    expect(c.bodyHtml).toContain("<h2>The fix</h2>");
    // The title is its own field, so it is not repeated at the top of the body.
    expect(c.bodyHtml.startsWith("<h1>")).toBe(false);
    expect(c.bodyText).toBe("It is not a sales problem.\n\nThe fix\n\nStart earlier.");
    expect(c.imageUrl).toBe("https://example.com/hero.png");
  });

  it("has no image when none exists", () => {
    expect(buildNewsletterCopy({ title: "T", markdown_body: "Body", imageUrl: null }).imageUrl).toBeNull();
  });
});
