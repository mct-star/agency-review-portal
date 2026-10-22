import { describe, expect, it } from "vitest";
import { matchesReviewFilter } from "./review-filter";

describe("review filters", () => {
  it("finds week review states with the same pending filter as posts", () => {
    for (const status of ["pending", "ready_for_review", "draft"]) expect(matchesReviewFilter(status, "A week", "pending", "")).toBe(true);
    expect(matchesReviewFilter("approved", "A week", "pending", "")).toBe(false);
  });
  it("combines search with status and ignores case and surrounding spaces", () => {
    expect(matchesReviewFilter("approved", "Example Company autumn week", "approved", "  AUTUMN ")).toBe(true);
    expect(matchesReviewFilter("pending", "Example Company autumn week", "approved", "autumn")).toBe(false);
    expect(matchesReviewFilter("approved", "Example Company autumn week", "approved", "winter")).toBe(false);
  });
  it("shows everything when both filters are clear", () => {
    expect(matchesReviewFilter("changes_requested", "A post", "", "")).toBe(true);
  });
});
