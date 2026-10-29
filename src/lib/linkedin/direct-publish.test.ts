import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directLinkedInJobId, linkedInDirectMedia, linkedinOutcomeMayBeUncertain } from "./direct-publish";

describe("what a direct LinkedIn post may carry", () => {
  const ours = "https://publishing-test.supabase.co/storage/v1/object/public/media/film.mp4";
  const video = (url = ours) => ({ shape: "video" as const, items: [{ kind: "video" as const, url, alt: "" }] });
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("accepts one video from our storage on a social post or a video piece", () => {
    expect(linkedInDirectMedia("social_post", video())).toEqual({ imageUrls: [], videoUrl: ours });
    expect(linkedInDirectMedia("video", video())).toEqual({ imageUrls: [], videoUrl: ours });
  });

  it("refuses a script, an outside address, a document, and a non-post without a video", () => {
    expect(linkedInDirectMedia("video_script", video())).toHaveProperty("error");
    expect(linkedInDirectMedia("social_post", video("https://example.com/film.mp4"))).toHaveProperty("error");
    expect(linkedInDirectMedia("social_post", { shape: "document", items: [{ kind: "document", url: ours, alt: "" }] })).toHaveProperty("error");
    expect(linkedInDirectMedia("video", { shape: "none", items: [] })).toHaveProperty("error");
  });

  it("keeps text and one image for social posts", () => {
    expect(linkedInDirectMedia("social_post", { shape: "none", items: [] })).toEqual({ imageUrls: [], videoUrl: null });
    const image = { kind: "image" as const, url: ours.replace("film.mp4", "a.png"), alt: "" };
    expect(linkedInDirectMedia("social_post", { shape: "image", items: [image] })).toEqual({ imageUrls: [image.url], videoUrl: null });
    expect(linkedInDirectMedia("social_post", { shape: "images", items: [image, image] })).toHaveProperty("error");
  });
});

describe("direct LinkedIn job identity and outcome safety", () => {
  it("uses one stable UUID per company, piece and explicit account", () => {
    const first = directLinkedInJobId("company-a", "piece-a", "account-a");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(directLinkedInJobId("company-a", "piece-a", "account-a")).toBe(first);
    expect(directLinkedInJobId("company-a", "piece-a", "account-b")).not.toBe(first);
    expect(directLinkedInJobId("company-b", "piece-a", "account-a")).not.toBe(first);
  });

  it("marks transport and server failures uncertain but definitive client rejection failed", () => {
    expect(linkedinOutcomeMayBeUncertain(new TypeError("fetch failed"))).toBe(true);
    expect(linkedinOutcomeMayBeUncertain(new Error("LinkedIn post creation failed (503)"))).toBe(true);
    expect(linkedinOutcomeMayBeUncertain(new Error("LinkedIn post creation failed (401)"))).toBe(false);
  });
});
