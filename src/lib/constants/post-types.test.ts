import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { POST_TYPES, POST_TYPE_SLUGS, getPostType, isVideoType } from "./post-types";

const NEW_SLUGS = [
  "meme",
  "podcast_hook_clip",
  "talking_head",
  "story_video",
  "reaction_ranking",
];

describe("post type registry", () => {
  it("gives every post type a label, colour, archetype, medium, production, contentType and generation config", () => {
    for (const pt of POST_TYPES) {
      expect(pt.label, `${pt.slug} label`).toBeTruthy();
      expect(pt.color, `${pt.slug} color`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(pt.archetype, `${pt.slug} archetype`).toBeTruthy();
      expect(pt.medium, `${pt.slug} medium`).toBeTruthy();
      expect(pt.production, `${pt.slug} production`).toBeTruthy();
      expect(pt.contentType, `${pt.slug} contentType`).toBeTruthy();
      expect(pt.generation, `${pt.slug} generation`).toBeTruthy();
    }
  });

  it("has unique slugs", () => {
    const slugs = POST_TYPES.map((pt) => pt.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("exposes every slug via POST_TYPE_SLUGS", () => {
    for (const pt of POST_TYPES) {
      expect(POST_TYPE_SLUGS).toContain(pt.slug);
    }
  });

  it("does not silently fall back to insight for an unknown slug", () => {
    expect(getPostType("bogus")).toBeUndefined();
    expect(getPostType("bogus")?.slug).not.toBe("insight");
  });

  it("gives every video post type a production brief", () => {
    for (const pt of POST_TYPES.filter((p) => p.medium === "video")) {
      expect(pt.brief, `${pt.slug} brief`).toBeTruthy();
      expect(pt.brief?.hook, `${pt.slug} brief.hook`).toBeTruthy();
      expect(pt.brief?.layout, `${pt.slug} brief.layout`).toBeTruthy();
      expect(pt.brief?.captions, `${pt.slug} brief.captions`).toBeTruthy();
      expect(pt.brief?.source, `${pt.slug} brief.source`).toBeTruthy();
    }
  });

  it("flags video post types with isVideoType()", () => {
    expect(isVideoType("podcast_hook_clip")).toBe(true);
    expect(isVideoType("talking_head")).toBe(true);
    expect(isVideoType("story_video")).toBe(true);
    expect(isVideoType("reaction_ranking")).toBe(true);
    expect(isVideoType("insight")).toBe(false);
    expect(isVideoType("meme")).toBe(false);
  });

  it("has the migration for every new slug", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../supabase/migrations/036_post_types_new_media.sql"
    );
    const migration = readFileSync(migrationPath, "utf8")
      + readFileSync(migrationPath.replace("036_post_types_new_media", "037_post_type_mini_infographic"), "utf8");
    for (const slug of NEW_SLUGS) {
      expect(migration, `migration mentions ${slug}`).toContain(slug);
    }
  });
});
