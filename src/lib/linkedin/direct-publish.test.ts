import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directLinkedInJobId, linkedInDirectMedia, linkedInOwnerUrn, linkedInPlatformForPostType, linkedinOutcomeMayBeUncertain } from "./direct-publish";

describe("what a direct LinkedIn post may carry", () => {
  const ours = "https://publishing-test.supabase.co/storage/v1/object/public/media/film.mp4";
  const thumbnail = ours.replace("film.mp4", "still.jpg");
  const video = (url = ours, thumbnailUrl: string | undefined = thumbnail) => ({ shape: "video" as const, items: [{ kind: "video" as const, url, alt: "" }], thumbnailUrl });
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("accepts one video from our storage on a social post or a video piece", () => {
    expect(linkedInDirectMedia("social_post", video())).toEqual({ imageUrls: [], videoUrl: ours, thumbnailUrl: thumbnail });
    expect(linkedInDirectMedia("video", video())).toEqual({ imageUrls: [], videoUrl: ours, thumbnailUrl: thumbnail });
  });

  it("refuses a video with no thumbnail, or one held outside our storage", () => {
    expect(linkedInDirectMedia("social_post", { shape: "video", items: video().items })).toEqual({ error: "This video has no thumbnail. Add one before publishing to LinkedIn." });
    expect(linkedInDirectMedia("video", video(ours, "https://example.com/still.jpg"))).toEqual({ error: "The post contains an unsupported thumbnail location." });
  });

  it("refuses a script, an outside address, a document, and a non-post without a video", () => {
    expect(linkedInDirectMedia("video_script", video())).toHaveProperty("error");
    expect(linkedInDirectMedia("social_post", video("https://example.com/film.mp4"))).toHaveProperty("error");
    expect(linkedInDirectMedia("social_post", { shape: "document", items: [{ kind: "document", url: ours, alt: "" }] })).toHaveProperty("error");
    expect(linkedInDirectMedia("video", { shape: "none", items: [] })).toHaveProperty("error");
  });

  it("keeps text and one image for social posts", () => {
    expect(linkedInDirectMedia("social_post", { shape: "none", items: [] })).toEqual({ imageUrls: [], videoUrl: null, thumbnailUrl: null });
    const image = { kind: "image" as const, url: ours.replace("film.mp4", "a.png"), alt: "" };
    expect(linkedInDirectMedia("social_post", { shape: "image", items: [image] })).toEqual({ imageUrls: [image.url], videoUrl: null, thumbnailUrl: null });
  });

  it("takes several images, in order, to post as one PDF document, and refuses more than twenty or one outside our storage", () => {
    const image = (name: string) => ({ kind: "image" as const, url: ours.replace("film.mp4", name), alt: "" });
    expect(linkedInDirectMedia("social_post", { shape: "images", items: [image("1.png"), image("2.png")] })).toEqual({ imageUrls: [image("1.png").url, image("2.png").url], videoUrl: null, thumbnailUrl: null });
    const many = Array.from({ length: 21 }, (_v, i) => image(`${i}.png`));
    expect(linkedInDirectMedia("social_post", { shape: "images", items: many })).toHaveProperty("error");
    expect(linkedInDirectMedia("social_post", { shape: "images", items: [image("1.png"), { kind: "image", url: "https://example.com/2.png", alt: "" }] })).toHaveProperty("error");
  });
});

describe("which LinkedIn account a piece's feed goes to", () => {
  it("sends company page pieces to a LinkedIn page and spokesperson pieces to a personal profile", () => {
    expect(linkedInPlatformForPostType("agency_product_story")).toBe("linkedin_company");
    expect(linkedInPlatformForPostType("problem_diagnosis")).toBe("linkedin_personal");
    expect(linkedInPlatformForPostType(null)).toBe("linkedin_personal");
  });
  it("names the account by its platform", () => {
    expect(linkedInOwnerUrn("linkedin_company", "111")).toBe("urn:li:organization:111");
    expect(linkedInOwnerUrn("linkedin_personal", "mem-1")).toBe("urn:li:person:mem-1");
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
