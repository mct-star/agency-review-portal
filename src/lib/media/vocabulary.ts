/**
 * The fixed tag vocabulary for the photo library.
 *
 * Tags are stored in photo_inventory.tags as "group:value" strings
 * (for example "weather:sunny", "place:deck"). The prefix is what lets
 * "night" mean a sky in one group and a time of day in another, and it
 * lets the library UI show each group as a row of toggles.
 *
 * Free-text tags that predate this (no prefix) are left alone.
 */

export const TAG_VOCABULARY = {
  weather: ["sunny", "bright", "grey", "overcast", "rain", "frost", "snow", "dusk", "night", "indoor"],
  place: ["deck", "lake", "garden", "bar", "dining_room", "kitchen", "rooms", "exterior"],
  subject: ["food", "drink", "people", "staff", "event", "empty_scene"],
  time: ["morning", "lunch", "afternoon", "evening", "night"],
} as const;

export type TagGroup = keyof typeof TAG_VOCABULARY;
export const TAG_GROUPS = Object.keys(TAG_VOCABULARY) as TagGroup[];

export const GROUP_LABELS: Record<TagGroup, string> = {
  weather: "Weather",
  place: "Where",
  subject: "What it shows",
  time: "Time of day",
};

export function tagKey(group: TagGroup, value: string): string {
  return `${group}:${value}`;
}

export function isVocabularyTag(tag: string): boolean {
  const [group, value] = tag.split(":");
  return (
    (TAG_GROUPS as string[]).includes(group) &&
    (TAG_VOCABULARY[group as TagGroup] as readonly string[]).includes(value)
  );
}

export function readableTag(tag: string): string {
  const value = tag.includes(":") ? tag.split(":")[1] : tag;
  return value.replace(/_/g, " ");
}

/** What the vision model must return. Every field is required. */
export interface AutoTagResult {
  weather: string[];
  place: string[];
  subject: string[];
  time_of_day: string[];
  people_present: boolean;
  text_space: boolean;
  scene: string;
}

export interface ParsedTags {
  tags: string[];
  people_present: boolean;
  text_space: boolean;
  scene_label: string;
}

const MAX_SCENE_CHARS = 160;

function pickFrom(group: TagGroup, raw: unknown, max: number): string[] {
  // The prompt asks for arrays; a small model at low effort sometimes
  // answers with a single string (live check, 14 Oct 2026). One value is
  // still a usable answer, so it is wrapped rather than rejected. Null or
  // absent means nothing chosen. Anything else is not the agreed shape.
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : raw == null ? [] : (() => { throw new Error(`${group} must be an array`); })();
  const allowed = TAG_VOCABULARY[group] as readonly string[];
  const out: string[] = [];
  for (const item of list) {
    // Anything outside the vocabulary is dropped, not trusted and not guessed at.
    if (typeof item === "string" && allowed.includes(item) && !out.includes(item)) out.push(item);
  }
  return out.slice(0, max);
}

/**
 * Strictly parse a model reply. Throws on anything that is not the agreed
 * shape (so a failed call is retried, never half-saved); silently drops
 * individual values outside the vocabulary.
 */
export function parseAutoTagJson(text: string): ParsedTags {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new Error("Tagger did not return JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Tagger JSON must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.people_present !== "boolean") throw new Error("people_present must be a boolean");
  if (typeof r.text_space !== "boolean") throw new Error("text_space must be a boolean");
  if (typeof r.scene !== "string" || !r.scene.trim()) throw new Error("scene must be a sentence");

  const weather = pickFrom("weather", r.weather, 2);
  const place = pickFrom("place", r.place, 2);
  const subject = pickFrom("subject", r.subject, 3);
  const time = pickFrom("time", r.time_of_day, 1);

  const tags = [
    ...weather.map((v) => tagKey("weather", v)),
    ...place.map((v) => tagKey("place", v)),
    ...subject.map((v) => tagKey("subject", v)),
    ...time.map((v) => tagKey("time", v)),
  ];
  // The boolean is the authority on people; keep the tag consistent with it.
  if (r.people_present && !tags.includes("subject:people") && !tags.includes("subject:staff")) {
    tags.push("subject:people");
  }
  if (!r.people_present) {
    const i = tags.indexOf("subject:people");
    if (i >= 0) tags.splice(i, 1);
  }

  return {
    tags,
    people_present: r.people_present,
    text_space: r.text_space,
    scene_label: r.scene.trim().replace(/\s+/g, " ").slice(0, MAX_SCENE_CHARS),
  };
}

/**
 * Merge new vocabulary tags into an existing list without disturbing tags a
 * person set by hand: vocabulary tags are replaced, everything else kept.
 */
export function mergeAutoTags(existing: string[], auto: string[]): string[] {
  const kept = existing.filter((t) => !isVocabularyTag(t));
  return [...new Set([...kept, ...auto])];
}

/** Toggle one vocabulary tag on or off. */
export function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

/**
 * Combine the tags from several frames of one video: a tag seen in any
 * frame stays (a clip that goes from sunny deck to dusk is both), capped per
 * group so a long clip does not collect everything.
 */
export function unionFrameTags(frames: ParsedTags[]): ParsedTags {
  const seen = new Set<string>();
  for (const f of frames) for (const t of f.tags) seen.add(t);
  const byGroup: Record<string, string[]> = {};
  for (const t of seen) (byGroup[t.split(":")[0]] ||= []).push(t);
  const caps: Record<string, number> = { weather: 3, place: 3, subject: 4, time: 2 };
  const tags = Object.entries(byGroup).flatMap(([g, list]) => list.slice(0, caps[g] ?? 3));
  return {
    tags,
    people_present: frames.some((f) => f.people_present),
    text_space: frames.every((f) => f.text_space),
    scene_label: frames[Math.floor(frames.length / 2)]?.scene_label ?? "",
  };
}

/** JSON schema handed to the model so replies come back in the agreed shape. */
export function autoTagResponseSchema() {
  const arr = (g: TagGroup) => ({ type: "ARRAY", items: { type: "STRING", enum: [...TAG_VOCABULARY[g]] } });
  return {
    type: "OBJECT",
    properties: {
      weather: arr("weather"),
      place: arr("place"),
      subject: arr("subject"),
      time_of_day: arr("time"),
      people_present: { type: "BOOLEAN" },
      text_space: { type: "BOOLEAN" },
      scene: { type: "STRING" },
    },
    required: ["weather", "place", "subject", "time_of_day", "people_present", "text_space", "scene"],
  };
}

export function autoTagPrompt(venueContext: string | null): string {
  const lines = TAG_GROUPS.map((g) => {
    const key = g === "time" ? "time_of_day" : g;
    return `- ${key}: choose only from ${TAG_VOCABULARY[g].join(", ")}`;
  });
  return [
    "You label photos for a hospitality venue's photo library. Describe only what is visible in the image.",
    venueContext ? `Venue context: ${venueContext}` : "",
    "Return JSON only, with exactly these fields:",
    ...lines,
    "- people_present: true if any person is visible, otherwise false",
    "- text_space: true if there is a clear area (sky, wall, water, table) where overlay text could be placed without covering the subject",
    "- scene: one short plain sentence describing the photo, British English, no brand names, no guesses about things you cannot see",
    "Use the fewest tags that are accurate. Use an empty array when nothing fits. Do not invent anything that is not in the picture.",
  ]
    .filter(Boolean)
    .join("\n");
}
