import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchResultsView } from "./ContentCalendar";

const piece = {
  id: "example-post", title: "A readable title for a useful conversation with your customer",
  markdown_body: "The preview gives you enough context to choose the right existing post.",
  content_type: "social_post", day_of_week: "Monday", scheduled_time: "09:00",
  post_type: "insight", approval_status: "changes_requested", image_generation_status: "none",
  week_id: "example-week", cover_image_url: null, first_comment: null,
};
const weeks = [{
  id: "example-week", week_number: 44, year: 2026, date_start: "2026-10-26", date_end: "2026-11-01",
  title: "Example week", pillar: "P1", theme: "A", status: "pending",
}];

describe("calendar search and recent results", () => {
  it.each(["search", "recent"] as const)("retains the full post and metadata in %s navigation", (mode) => {
    const html = renderToStaticMarkup(createElement(SearchResultsView, { results: [piece], weeks, loading: false, mode, query: "customer" }));
    expect(html).toContain('href="/content/example-post"');
    expect(html).toContain(piece.title);
    expect(html).toContain(piece.markdown_body);
    expect(html).toContain("w/c 26 Oct");
    expect(html).toContain("Changes Requested");
    expect(html).not.toContain("<button");
  });

  it("keeps every returned post linked, including one with no week metadata", () => {
    const results = Array.from({ length: 17 }, (_, index) => ({ ...piece, id: `example-${index}`, week_id: index === 16 ? "standalone-week" : piece.week_id }));
    const html = renderToStaticMarkup(createElement(SearchResultsView, { results, weeks, loading: false, mode: "recent", query: "" }));
    expect(html.match(/href="\/content\/example-\d+"/g)).toHaveLength(17);
    expect(html).toContain('href="/content/example-16"');
  });
});
