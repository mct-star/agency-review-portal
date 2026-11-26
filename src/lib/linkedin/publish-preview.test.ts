import { describe, expect, it } from "vitest";
import { escapeLittleText } from "./post-text";
import {
  carouselTitle,
  defaultCarouselTitle,
  linkedInPublishPreview,
  publishPreviewMode,
  unescapeLittleText,
  type LinkedInPublishPayload,
} from "./publish-preview";

const base: LinkedInPublishPayload = { piece_id: "p1", commentary: "Hello", image_urls: [], first_comment: null };
const imgs = (n: number) => Array.from({ length: n }, (_, i) => `https://x.supabase.co/storage/v1/object/public/content-assets/s${i + 1}.png`);

describe("publishPreviewMode", () => {
  it("several images are one PDF document, as the publisher posts them", () => {
    expect(publishPreviewMode({ image_urls: imgs(7) })).toBe("pdf");
    expect(publishPreviewMode({ image_urls: imgs(2) })).toBe("pdf");
  });
  it("one image is a single image post", () => {
    expect(publishPreviewMode({ image_urls: imgs(1) })).toBe("image");
  });
  it("a video wins", () => {
    expect(publishPreviewMode({ image_urls: imgs(1), video_url: "https://x/v.mp4" })).toBe("video");
  });
  it("nothing attached is text only", () => {
    expect(publishPreviewMode({ image_urls: [] })).toBe("none");
  });
});

describe("carousel title", () => {
  it("uses document_title when the payload has it", () => {
    expect(carouselTitle({ commentary: "First line\nSecond", document_title: "The title" })).toBe("The title");
  });
  it("falls back to the commentary's first line, max 100 characters, like the publisher", () => {
    expect(carouselTitle({ commentary: "  First line\nSecond" })).toBe("First line");
    expect(carouselTitle({ commentary: "a".repeat(140) })).toHaveLength(100);
  });
  it("the route's default title is the first line as the reader sees it", () => {
    expect(defaultCarouselTitle("Why (most) launches stall\nBody")).toBe("Why (most) launches stall");
  });
});

describe("linkedInPublishPreview", () => {
  it("shows the commentary as the reader sees it, escapes removed", () => {
    const text = "Launches (most) fail. #1 reason: a_b @ c";
    expect(unescapeLittleText(escapeLittleText(text))).toBe(text);
    expect(linkedInPublishPreview({ ...base, commentary: escapeLittleText(text) }).text).toBe(text);
  });
  it("a 7-slide carousel keeps every page in order with the first comment", () => {
    const p = linkedInPublishPreview({ ...base, image_urls: imgs(7), first_comment: "Read more: https://agencymedicalmarketing.com/x" });
    expect(p.mode).toBe("pdf");
    expect(p.imageUrls).toEqual(imgs(7));
    expect(p.documentTitle).toBe("Hello");
    expect(p.firstComment).toContain("https://agencymedicalmarketing.com/x");
  });
  it("a video carries its thumbnail as poster and no images", () => {
    const p = linkedInPublishPreview({ ...base, image_urls: [], video_url: "https://x/v.mp4", thumbnail_url: "https://x/t.jpg" });
    expect(p).toMatchObject({ mode: "video", videoUrl: "https://x/v.mp4", thumbnailUrl: "https://x/t.jpg", imageUrls: [], documentTitle: null });
  });
  it("text only has no media and no comment", () => {
    expect(linkedInPublishPreview(base)).toMatchObject({ mode: "none", imageUrls: [], documentTitle: null, firstComment: null });
  });
});

describe("title cut", () => {
  it("never splits an emoji at the 100th character", () => {
    const line = "a".repeat(99) + "🙂tail";
    const t = defaultCarouselTitle(line);
    expect(Array.from(t)).toHaveLength(100);
    expect(t.endsWith("🙂")).toBe(true);
  });
});
