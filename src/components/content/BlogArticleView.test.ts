import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BlogArticleView from "./BlogArticleView";
import { BLOG_ENDING_RESOURCES } from "./blog-ending-resources";

describe("blog preview ending", () => {
  const html = renderToStaticMarkup(createElement(BlogArticleView, { markdown: "Body text", images: [] }));

  it("ends with the website ending after the article", () => {
    expect(html).toContain("How this post ends on the website");
    expect(html.indexOf("Body text")).toBeLessThan(html.indexOf("How this post ends on the website"));
  });

  it("shows the four resource tiles in website order with absolute links and images", () => {
    expect(BLOG_ENDING_RESOURCES.map(r => r.id)).toEqual(["trust-targeting", "assessments", "snake-oil-and-ladders", "book"]);
    const positions = BLOG_ENDING_RESOURCES.map(r => html.indexOf(r.cta.replace("&", "&amp;")));
    expect(positions.every(p => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const r of BLOG_ENDING_RESOURCES) {
      expect(r.href).toMatch(/^https:\/\//);
      expect(html).toContain(`src="${r.shareImage}"`);
    }
  });

  it("lists the four placeholders then the carousel, in the live page order", () => {
    const order = ["1. Call to action.", "2. Newsletter.", "3. Author and related posts.", "4. Tagline band.", "5. Resources carousel", "Useful before we ever speak", "Choose your next step."].map(s => html.indexOf(s));
    expect(order.every(p => p > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf("Choose your next step.")).toBeLessThan(html.indexOf(BLOG_ENDING_RESOURCES[0].cta));
  });
});
