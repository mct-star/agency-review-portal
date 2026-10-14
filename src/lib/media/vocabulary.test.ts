import { describe, expect, it } from "vitest";
import {
  TAG_VOCABULARY,
  isVocabularyTag,
  mergeAutoTags,
  parseAutoTagJson,
  toggleTag,
  unionFrameTags,
} from "./vocabulary";

const good = {
  weather: ["sunny"],
  place: ["deck", "lake"],
  subject: ["drink"],
  time_of_day: ["afternoon"],
  people_present: false,
  text_space: true,
  scene: "A sunny terrace with tables set beside the lake.",
};

describe("the fixed vocabulary", () => {
  it("matches the agreed lists exactly", () => {
    expect(TAG_VOCABULARY.weather).toEqual(["sunny", "bright", "grey", "overcast", "rain", "frost", "snow", "dusk", "night", "indoor"]);
    expect(TAG_VOCABULARY.place).toEqual(["deck", "lake", "garden", "bar", "dining_room", "kitchen", "rooms", "exterior"]);
    expect(TAG_VOCABULARY.subject).toEqual(["food", "drink", "people", "staff", "event", "empty_scene"]);
    expect(TAG_VOCABULARY.time).toEqual(["morning", "lunch", "afternoon", "evening", "night"]);
  });

  it("keeps night distinct as a sky and as a time of day", () => {
    expect(isVocabularyTag("weather:night")).toBe(true);
    expect(isVocabularyTag("time:night")).toBe(true);
    expect(isVocabularyTag("night")).toBe(false);
  });
});

describe("parseAutoTagJson", () => {
  it("turns a valid reply into prefixed tags", () => {
    const r = parseAutoTagJson(JSON.stringify(good));
    expect(r.tags).toEqual(["weather:sunny", "place:deck", "place:lake", "subject:drink", "time:afternoon"]);
    expect(r.people_present).toBe(false);
    expect(r.text_space).toBe(true);
    expect(r.scene_label).toBe(good.scene);
  });

  it("accepts a reply wrapped in a code fence", () => {
    expect(parseAutoTagJson("```json\n" + JSON.stringify(good) + "\n```").tags).toHaveLength(5);
  });

  it("drops values outside the vocabulary instead of trusting them", () => {
    const r = parseAutoTagJson(JSON.stringify({ ...good, weather: ["sunny", "tornado"], place: ["pool"] }));
    expect(r.tags).toContain("weather:sunny");
    expect(r.tags.some((t) => t.includes("tornado") || t.includes("pool"))).toBe(false);
  });

  it("rejects replies that are not the agreed shape", () => {
    expect(() => parseAutoTagJson("sunny deck")).toThrow();
    expect(() => parseAutoTagJson(JSON.stringify({ ...good, people_present: "no" }))).toThrow();
    expect(() => parseAutoTagJson(JSON.stringify({ ...good, weather: 7 }))).toThrow();
    expect(() => parseAutoTagJson(JSON.stringify({ ...good, scene: "" }))).toThrow();
    expect(() => parseAutoTagJson("[]")).toThrow();
  });

  it("accepts a single string or null where an array was asked for", () => {
    // A small model at low effort sometimes answers a group with one string.
    expect(parseAutoTagJson(JSON.stringify({ ...good, weather: "grey" })).tags).toContain("weather:grey");
    expect(parseAutoTagJson(JSON.stringify({ ...good, weather: null })).tags).not.toContain("weather:sunny");
  });

  it("keeps the people tag consistent with people_present", () => {
    expect(parseAutoTagJson(JSON.stringify({ ...good, people_present: true })).tags).toContain("subject:people");
    expect(parseAutoTagJson(JSON.stringify({ ...good, subject: ["people"], people_present: false })).tags).not.toContain("subject:people");
  });

  it("caps the scene sentence", () => {
    expect(parseAutoTagJson(JSON.stringify({ ...good, scene: "x".repeat(500) })).scene_label.length).toBeLessThanOrEqual(160);
  });
});

describe("tag editing helpers", () => {
  it("keeps hand-written tags when auto tags are merged", () => {
    expect(mergeAutoTags(["birthday", "weather:rain"], ["weather:sunny"])).toEqual(["birthday", "weather:sunny"]);
  });
  it("toggles a tag on and off", () => {
    expect(toggleTag(["a"], "weather:sunny")).toEqual(["a", "weather:sunny"]);
    expect(toggleTag(["a", "weather:sunny"], "weather:sunny")).toEqual(["a"]);
  });
});

describe("unionFrameTags", () => {
  const frame = (tags: string[], people: boolean, space: boolean, scene = "s") => ({
    tags,
    people_present: people,
    text_space: space,
    scene_label: scene,
  });
  it("keeps a tag seen in any frame and flags people if any frame has them", () => {
    const r = unionFrameTags([
      frame(["weather:sunny", "place:deck"], false, true, "start"),
      frame(["weather:dusk", "place:deck"], true, true, "middle"),
      frame(["weather:night"], false, false, "end"),
    ]);
    expect(r.tags).toEqual(expect.arrayContaining(["weather:sunny", "weather:dusk", "weather:night", "place:deck"]));
    expect(r.people_present).toBe(true);
    expect(r.text_space).toBe(false);
    expect(r.scene_label).toBe("middle");
  });
});
