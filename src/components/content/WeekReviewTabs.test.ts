import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WeekReviewTabs from "./WeekReviewTabs";

describe("social week review", () => {
  it("links each social preview to the item's existing approval page", () => {
    const piece = {
      id: "social-piece", title: "A draft to review", content_type: "social_post",
      company_id: "ours", approval_status: "pending", post_type: "insight",
      markdown_body: "Read this draft", images: [], assets: [],
    } as unknown as ComponentProps<typeof WeekReviewTabs>["socialPieces"][number];
    const html = renderToStaticMarkup(createElement(WeekReviewTabs, {
      socialPieces: [piece], blogPieces: [], articlePieces: [], allPieces: [piece], authorName: "Author",
    }));
    expect(html).toContain('href="/content/social-piece"');
    expect(html).toContain(">Open to approve</a>");
    expect(html).toContain(">Preview</button>");
    expect(html).toContain(">Pending</span>");
  });
});
