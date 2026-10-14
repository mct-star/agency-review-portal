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

describe("hospitality pack", () => {
  const SLUGS = ["weather_of_the_day", "special_of_the_day", "whats_on_this_week", "live_scene", "event"];

  it("has the five post types, all in the hospitality pack", async () => {
    const { HOSPITALITY_POST_TYPES, postTypesForPack } = await import("./post-types");
    expect(HOSPITALITY_POST_TYPES.map((p) => p.slug)).toEqual(SLUGS);
    expect(postTypesForPack("hospitality").map((p) => p.slug)).toEqual(SLUGS);
  });

  it("keeps the two packs apart so a company only sees its own", async () => {
    const { postTypesForPack, isPostTypeInPack } = await import("./post-types");
    const b2b = postTypesForPack("b2b").map((p) => p.slug);
    expect(b2b).toContain("insight");
    for (const s of SLUGS) expect(b2b).not.toContain(s);
    expect(postTypesForPack(undefined).map((p) => p.slug)).toEqual(b2b);
    expect(isPostTypeInPack("event", "hospitality")).toBe(true);
    expect(isPostTypeInPack("event", "b2b")).toBe(false);
    expect(isPostTypeInPack("insight", "hospitality")).toBe(false);
  });

  it("gives each type word limits, a brief hint, image guidance and library photos only", async () => {
    const { HOSPITALITY_POST_TYPES } = await import("./post-types");
    for (const pt of HOSPITALITY_POST_TYPES) {
      expect(pt.generation.minWords, pt.slug).toBeGreaterThan(0);
      expect(pt.generation.maxWords, pt.slug).toBeGreaterThan(pt.generation.minWords!);
      expect(pt.briefHint, pt.slug).toBeTruthy();
      expect(pt.libraryQuery, pt.slug).toBeTruthy();
      expect(pt.generation.imageStyle, pt.slug).toBe("SKIP");
      expect(pt.archetype, pt.slug).toBe("library_photo");
    }
  });

  it("only uses library tags from the fixed vocabulary", async () => {
    const { HOSPITALITY_POST_TYPES } = await import("./post-types");
    const { TAG_VOCABULARY } = await import("@/lib/media/vocabulary");
    for (const pt of HOSPITALITY_POST_TYPES) {
      for (const p of pt.libraryQuery?.place ?? []) expect(TAG_VOCABULARY.place as readonly string[], `${pt.slug} ${p}`).toContain(p);
      for (const sj of pt.libraryQuery?.subject ?? []) expect(TAG_VOCABULARY.subject as readonly string[], `${pt.slug} ${sj}`).toContain(sj);
    }
  });

  it("has template rows in migration 040, and unique slugs across both packs", async () => {
    const { ALL_POST_TYPES } = await import("./post-types");
    const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/040_hospitality_pack.sql"), "utf8");
    for (const s of SLUGS) expect(sql).toContain(`'${s}'`);
    expect(new Set(ALL_POST_TYPES.map((p) => p.slug)).size).toBe(ALL_POST_TYPES.length);
  });

  it("still resolves a hospitality slug through getPostType, and never confuses it for insight", async () => {
    const { getPostType } = await import("./post-types");
    expect(getPostType("event")?.pack).toBe("hospitality");
  });
});
