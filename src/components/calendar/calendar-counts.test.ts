import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CalendarCounts, { calendarViewPieces, UnscheduledCount } from "./CalendarCounts";
import ContentCalendar, { SearchResultsView } from "./ContentCalendar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const text = (html: string) => html.replace(/<[^>]*>/g, "");
const item = (id: string, approval_status = "pending") => ({ id, approval_status });
const post = (id: string, approval_status = "pending") => ({
  ...item(id, approval_status), title: `A useful conversation ${id}`, markdown_body: "A useful post to recognise before opening.",
  content_type: "social_post", day_of_week: "monday", scheduled_time: null, post_type: "insight",
  image_generation_status: "none", week_id: "example-week", cover_image_url: null, first_comment: null,
});
const renderResults = (overrides: Partial<Parameters<typeof SearchResultsView>[0]> = {}) => renderToStaticMarkup(createElement(SearchResultsView, {
  results: [post("one")], weeks: [], loading: false, mode: "recent", query: "", companyName: "Example Company", ...overrides,
}));

describe("calendar view counts", () => {
  const cells = [
    { isCurrentMonth: false, pieces: [item("previous-month")] },
    { isCurrentMonth: true, pieces: [item("this-month", "approved"), item("another-post")] },
    { isCurrentMonth: false, pieces: [item("next-month", "changes_requested")] },
  ];

  it("counts all seven-day cells for Week, including a cross-month boundary", () => {
    expect(calendarViewPieces(cells, "week").map(p => p.id)).toEqual(["previous-month", "this-month", "another-post", "next-month"]);
  });

  it("excludes neighbouring-month cells from Month without counting the loaded buffer", () => {
    expect(calendarViewPieces(cells, "month").map(p => p.id)).toEqual(["this-month", "another-post"]);
  });

  it("labels the company, dates and exact approval statuses of the shown posts", () => {
    const html = renderToStaticMarkup(createElement(CalendarCounts, {
      items: [item("approved", "approved"), item("pending"), item("changes", "changes_requested")],
      heading: "Scheduled this week", scope: "Example Company | 26 Oct 2026 to 1 Nov 2026", note: "Unscheduled posts and empty schedule slots are excluded.",
    }));
    const content = text(html);
    expect(content).toContain("Example Company | 26 Oct 2026 to 1 Nov 2026");
    expect(content).toContain("3 posts shown");
    expect(content).toContain("1 approved");
    expect(content).toContain("1 pending approval");
    expect(content).toContain("1 changes requested");
    expect(content).toContain("Unscheduled posts and empty schedule slots are excluded.");
  });

  it("shows explicit zero counts for an empty loaded date range", () => {
    const html = text(renderToStaticMarkup(createElement(CalendarCounts, { items: [], heading: "Scheduled this month", scope: "Example Company | November 2026", note: "Unscheduled posts are excluded." })));
    expect(html).toContain("0 posts shown");
    expect(html).toContain("0 approved");
    expect(html).toContain("0 pending approval");
    expect(html).toContain("0 changes requested");
  });

  it.each([{ loading: true }, { error: "Could not load counts." }])("does not present stale or zero counts before a successful response: %o", (state) => {
    const html = text(renderToStaticMarkup(createElement(CalendarCounts, { items: [item("old")], heading: "Scheduled this week", scope: "Example Company", note: "", ...state })));
    expect(html).not.toContain("post shown");
    expect(html).not.toContain("0 posts");
    expect(html).toContain(state.loading ? "Loading counts..." : "Could not load counts.");
  });
});

describe("search and recent count scope", () => {
  it("counts the 17 returned recent posts, including unscheduled entries, rather than a separate calendar total", () => {
    const results = Array.from({ length: 17 }, (_, i) => ({ ...post(`${i}`, i ? "pending" : "approved"), day_of_week: i < 14 ? "monday" : null }));
    const html = renderResults({ results });
    expect(text(html)).toContain("17 posts shown");
    expect(text(html)).toContain("1 approved");
    expect(text(html)).toContain("16 pending approval");
    expect(text(html)).toContain("Example Company | All dates | All approval statuses");
    expect(text(html)).toContain("Up to 20 newest posts saved under a week or Standalone content, including posts without a scheduled day.");
    expect(html.match(/href="\/content\//g)).toHaveLength(17);
  });

  it("opens pending-only results with no text query instead of hiding the returned list", () => {
    const html = renderResults({ mode: "search", query: "", statusFilter: "pending" });
    expect(html).toContain('href="/content/one"');
    expect(text(html)).toContain("Pending approval results");
    expect(text(html)).toContain("Example Company | All dates | Pending approval only");
    expect(text(html)).toContain("Up to 50 newest matching posts saved under a week or Standalone content");
    expect(html).not.toContain("Type at least 2 characters");
  });

  it("retains the status and text scope together", () => {
    const html = text(renderResults({ mode: "search", query: "customer", statusFilter: "pending" }));
    expect(html).toContain("Pending approval only | Search: customer");
  });

  it("shows a scoped zero for an empty pending result", () => {
    const html = text(renderResults({ mode: "search", statusFilter: "pending", results: [] }));
    expect(html).toContain("0 posts shown");
    expect(html).toContain("No matching posts pending approval.");
    expect(html).not.toContain("Type at least 2 characters");
  });

  it("does not claim a result count before a text search is valid", () => {
    const html = text(renderResults({ mode: "search", query: "x" }));
    expect(html).toContain("Type at least 2 characters");
    expect(html).not.toContain("post shown");
    expect(html).not.toContain("posts shown");
  });

  it("keeps the status button available when the date-loaded calendar has no pending posts", () => {
    const html = text(renderToStaticMarkup(createElement(ContentCalendar, { companies: [{ id: "example", name: "Example Company", brand_color: null }] })));
    expect(html).toContain("Pending approval");
    expect(html).not.toContain("0 Pending Approval");
    expect(html).toContain("Example Company | Four-week plan");
  });
});

describe("unscheduled count scope", () => {
  it.each([0, 3, 60])("labels %i tray results as bounded shown posts across all dates and statuses", (count) => {
    const html = text(renderToStaticMarkup(createElement(UnscheduledCount, { count, loading: false, error: null })));
    expect(html).toContain(`${count} posts shown`);
    expect(html).toContain("All dates and approval statuses.");
    expect(html).toContain("Shows up to 60 newest posts that have no scheduled day or are saved under Standalone content.");
  });

  it("withholds the count on loading or failure", () => {
    for (const state of [{ loading: true, error: null }, { loading: false, error: "Failed" }]) {
      const html = text(renderToStaticMarkup(createElement(UnscheduledCount, { count: 3, ...state })));
      expect(html).not.toContain("3 posts shown");
      expect(html).toContain(state.loading ? "Loading posts..." : "Count unavailable");
    }
  });
});
