import { describe, expect, it } from "vitest";
import { directMetaJobId, isMetaPublicMediaUrl, metaMayHavePublished, toMetaCaption } from "./direct-publish";

describe("direct Meta publishing boundaries", () => {
  it("uses an idempotent job id per exact company, piece, account and network", () => {
    const first = directMetaJobId("company", "piece", "account", "facebook");
    expect(directMetaJobId("company", "piece", "account", "facebook")).toBe(first);
    expect(directMetaJobId("company", "piece", "account", "instagram")).not.toBe(first);
    expect(directMetaJobId("other", "piece", "account", "facebook")).not.toBe(first);
  });

  it("preserves approved hashtags while rendering basic Markdown as visible text", () => {
    expect(toMetaCaption("## **Hello**\n\n- Keep #Launch\n- [Read](https://example.com)")).toBe("Hello\n\nKeep #Launch\nRead (https://example.com)");
    expect(toMetaCaption("#" + "a".repeat(2201)).length).toBe(2202);
  });

  it("accepts only this project's public, unsigned storage object URLs", () => {
    const base = "https://project.supabase.co/storage/v1/object/";
    expect(isMetaPublicMediaUrl(base + "public/posts/photo.jpg")).toBe(false);
    expect(isMetaPublicMediaUrl("https://project.supabase.co/storage/v1/object/public/posts/photo.jpg", "https://project.supabase.co")).toBe(true);
    expect(isMetaPublicMediaUrl("https://project.supabase.co/storage/v1/object/sign/posts/photo.jpg?token=x", "https://project.supabase.co")).toBe(false);
    expect(isMetaPublicMediaUrl("https://outside.example/photo.jpg", "https://project.supabase.co")).toBe(false);
  });

  it("marks only potentially accepted final publishes for manual checking", () => {
    expect(metaMayHavePublished(500, "publish")).toBe(true);
    expect(metaMayHavePublished(null, "publish")).toBe(true);
    expect(metaMayHavePublished(400, "publish")).toBe(false);
    expect(metaMayHavePublished(500, "container")).toBe(false);
  });
});
