import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LinkedInPublishMockup from "./LinkedInPublishMockup";
import { linkedInPublishPreview, type LinkedInPublishPayload } from "@/lib/linkedin/publish-preview";

const long = [
  "Most medtech launches stall in month three.",
  "",
  "Not because the product is wrong. Because nobody told the people who refer patients why it matters to them, in their words, at the moment they decide.",
  "",
  "TAIL_SENTENCE_AFTER_THE_FOLD",
].join("\n");

function render(payload: Partial<LinkedInPublishPayload>, device: "desktop" | "mobile" = "desktop") {
  const preview = linkedInPublishPreview({ piece_id: "p", commentary: "Short", image_urls: [], first_comment: null, ...payload });
  return renderToStaticMarkup(createElement(LinkedInPublishMockup, { preview, authorName: "Michael Colling-Tuck", authorTagline: "Founder", device }));
}

describe("LinkedInPublishMockup", () => {
  it("folds long text behind see more", () => {
    const html = render({ commentary: long });
    expect(html).toContain("see more");
    expect(html).toContain("Most medtech launches stall");
    expect(html).not.toContain("TAIL_SENTENCE_AFTER_THE_FOLD");
  });

  it("does not fold a short post", () => {
    const html = render({ commentary: "One line only." });
    expect(html).not.toContain("see more");
  });

  it("shows the author header with now and the globe", () => {
    const html = render({});
    expect(html).toContain("Michael Colling-Tuck");
    expect(html).toContain("Founder");
    expect(html).toContain("now");
    expect(html).toContain('aria-label="Anyone"');
  });

  it("draws a carousel as a document viewer with title and page counter", () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://x/s${i + 1}.png`);
    const html = render({ image_urls: urls, document_title: "Seven slides" });
    expect(html).toContain('data-testid="mockup-document"');
    expect(html).toContain("Seven slides");
    expect(html).toContain("7 pages");
    expect(html).toMatch(/1 \/ (<!-- -->)?7/);
    expect(html).toContain('aria-label="Next page"');
    expect(html).not.toContain('aria-label="Previous page"');
    for (const u of urls) expect(html).toContain(u);
  });

  it("draws one image, a playable video with its poster, or nothing", () => {
    expect(render({ image_urls: ["https://x/one.png"] })).toContain('data-testid="mockup-single-image"');
    const video = render({ video_url: "https://x/v.mp4", thumbnail_url: "https://x/t.jpg" });
    expect(video).toContain("<video");
    expect(video).toContain('poster="https://x/t.jpg"');
    expect(video).toContain("controls");
    const none = render({});
    expect(none).not.toContain("<img");
    expect(none).not.toContain("<video");
  });

  it("shows the first comment with its link, or says plainly there is none", () => {
    const html = render({ first_comment: "Full guide: https://agencymedicalmarketing.com/guide" });
    expect(html).toContain('href="https://agencymedicalmarketing.com/guide"');
    expect(html).toContain("Author");
    expect(render({})).toContain("This post has no first comment.");
  });
});
