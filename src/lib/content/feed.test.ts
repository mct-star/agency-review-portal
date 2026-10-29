import { describe, expect, it } from "vitest";
import { basePostType, feedLabel, hasBothFeeds, pieceFeed } from "./feed";

describe("piece feed", () => {
  it("reads the company page from the agency_ post type prefix", () => {
    expect(pieceFeed("agency_product_story")).toBe("company_page");
    expect(pieceFeed("agency_book_a_call_cta")).toBe("company_page");
  });

  it("treats every other post type, and none, as the person's feed", () => {
    expect(pieceFeed("insight")).toBe("person");
    expect(pieceFeed("blog_article")).toBe("person");
    expect(pieceFeed(null)).toBe("person");
    expect(pieceFeed(undefined)).toBe("person");
  });

  it("strips the prefix for labels", () => {
    expect(basePostType("agency_book_a_call_cta")).toBe("book_a_call_cta");
    expect(basePostType("insight")).toBe("insight");
    expect(basePostType(null)).toBeNull();
  });

  it("knows when a week mixes both feeds", () => {
    expect(hasBothFeeds([{ post_type: "insight" }, { post_type: "agency_product_story" }])).toBe(true);
    expect(hasBothFeeds([{ post_type: "insight" }, { post_type: null }])).toBe(false);
    expect(hasBothFeeds([])).toBe(false);
  });

  it("labels the chip", () => {
    expect(feedLabel("company_page", "Michael Colling-Tuck")).toBe("Company page");
    expect(feedLabel("person", "Michael Colling-Tuck")).toBe("Michael Colling-Tuck");
    expect(feedLabel("person", null)).toBe("Personal");
  });
});
