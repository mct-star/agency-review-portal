import { describe, expect, it } from "vitest";
import { selectImages, scoreCandidate, type LibraryCandidate } from "./select-images";

const photo = (id: string, tags: string[], over: Partial<LibraryCandidate> = {}): LibraryCandidate => ({
  id, kind: "photo", tags, people_present: false, last_used_at: null, used_in_weeks: [], status: "approved", ...over,
});
const fixed = () => 0.5;
const ids = (list: LibraryCandidate[]) => list.map((c) => c.id);

describe("selectImages", () => {
  it("puts the photo that matches the weather first", () => {
    const lib = [
      photo("rain", ["weather:rain", "place:deck"]),
      photo("sun", ["weather:sunny", "place:deck"]),
      photo("grey", ["weather:grey", "place:deck"]),
    ];
    const got = selectImages(lib, { weather: ["sunny", "bright"], place: ["deck"], avoidPeople: true }, { count: 1, rng: fixed });
    expect(ids(got)).toEqual(["sun"]);
  });

  it("falls back down the preference list when the best weather has no photo", () => {
    const lib = [photo("rain", ["weather:rain"]), photo("bright", ["weather:bright"])];
    const got = selectImages(lib, { weather: ["sunny", "bright"], avoidPeople: true }, { count: 1, rng: fixed });
    expect(ids(got)).toEqual(["bright"]);
  });

  it("prefers the place that suits the weather", () => {
    const lib = [photo("bar", ["weather:rain", "place:bar"]), photo("dining", ["weather:rain", "place:dining_room"])];
    const got = selectImages(lib, { weather: ["rain"], place: ["dining_room", "bar"], avoidPeople: true }, { count: 1, rng: fixed });
    expect(ids(got)).toEqual(["dining"]);
  });

  it("prefers the least recently used among equally good photos", () => {
    const lib = [
      photo("recent", ["weather:sunny", "place:deck"], { last_used_at: "2026-10-12T07:00:00Z" }),
      photo("older", ["weather:sunny", "place:deck"], { last_used_at: "2026-09-01T07:00:00Z" }),
      photo("never", ["weather:sunny", "place:deck"], { last_used_at: null }),
    ];
    const got = selectImages(lib, { weather: ["sunny"], place: ["deck"], avoidPeople: true }, { count: 3, rng: fixed });
    expect(ids(got)).toEqual(["never", "older", "recent"]);
  });

  it("uses the number of weeks a photo has been used as the next tiebreak", () => {
    const lib = [
      photo("twice", ["weather:sunny"], { last_used_at: "2026-09-01T00:00:00Z", used_in_weeks: [30, 35] }),
      photo("once", ["weather:sunny"], { last_used_at: "2026-09-01T00:00:00Z", used_in_weeks: [30] }),
    ];
    expect(ids(selectImages(lib, { weather: ["sunny"], avoidPeople: true }, { count: 1, rng: fixed }))).toEqual(["once"]);
  });

  it("never picks a photo with a person in it when people are to be avoided", () => {
    const lib = [photo("crowd", ["weather:sunny", "place:deck", "subject:people"], { people_present: true }), photo("empty", ["weather:bright", "place:deck"])];
    const got = selectImages(lib, { weather: ["sunny", "bright"], avoidPeople: true }, { count: 2, rng: fixed });
    expect(ids(got)).toEqual(["empty"]);
  });

  it("allows people when the post asks for them", () => {
    const lib = [photo("crowd", ["weather:sunny", "subject:people"], { people_present: true })];
    expect(ids(selectImages(lib, { weather: ["sunny"], avoidPeople: false }, { count: 1, rng: fixed }))).toEqual(["crowd"]);
  });

  it("ranks a photo we have not assessed for people below one we have", () => {
    const lib = [photo("unknown", ["weather:sunny"], { people_present: null }), photo("known", ["weather:sunny"], { people_present: false })];
    expect(ids(selectImages(lib, { weather: ["sunny"], avoidPeople: true }, { count: 2, rng: fixed }))).toEqual(["known", "unknown"]);
  });

  it("never picks a pending photo or a video", () => {
    const lib = [
      photo("pending", ["weather:sunny"], { status: "pending" }),
      photo("clip", ["weather:sunny"], { kind: "video" }),
      photo("ok", ["weather:grey"]),
    ];
    expect(ids(selectImages(lib, { weather: ["sunny"], avoidPeople: true }, { count: 3, rng: fixed }))).toEqual(["ok"]);
  });

  it("spreads three picks across different places", () => {
    const lib = [
      photo("deck1", ["weather:sunny", "place:deck"]),
      photo("deck2", ["weather:sunny", "place:deck"]),
      photo("lake", ["weather:sunny", "place:lake"]),
      photo("garden", ["weather:sunny", "place:garden"]),
    ];
    const got = selectImages(lib, { weather: ["sunny"], place: ["deck", "lake", "garden"], avoidPeople: true }, { count: 3, rng: fixed });
    const places = got.map((c) => c.tags.find((t) => t.startsWith("place:")));
    expect(new Set(places).size).toBe(3);
  });

  it("returns fewer than asked when the library is small, and nothing from an empty one", () => {
    expect(selectImages([photo("a", ["weather:sunny"])], { weather: ["sunny"], avoidPeople: true }, { count: 3, rng: fixed })).toHaveLength(1);
    expect(selectImages([], { weather: ["sunny"], avoidPeople: true }, { count: 3 })).toEqual([]);
  });

  it("skips photos that match nothing when some do match, but still returns something when none do", () => {
    const lib = [photo("irrelevant", ["subject:food"]), photo("match", ["weather:sunny"])];
    expect(ids(selectImages(lib, { weather: ["sunny"], avoidPeople: true }, { count: 2, rng: fixed }))).toEqual(["match"]);
    expect(ids(selectImages([photo("x", ["subject:food"])], { weather: ["sunny"], avoidPeople: true }, { count: 1, rng: fixed }))).toEqual(["x"]);
  });

  it("honours an exclusion list", () => {
    const lib = [photo("a", ["weather:sunny"]), photo("b", ["weather:sunny"])];
    expect(ids(selectImages(lib, { weather: ["sunny"], avoidPeople: true }, { count: 2, rng: fixed, excludeIds: ["a"] }))).toEqual(["b"]);
  });
});

describe("scoreCandidate", () => {
  it("scores a weather match above a place match", () => {
    const w = scoreCandidate(photo("w", ["weather:sunny"]), { weather: ["sunny"], place: ["deck"], avoidPeople: false });
    const p = scoreCandidate(photo("p", ["place:deck"]), { weather: ["sunny"], place: ["deck"], avoidPeople: false });
    expect(w).toBeGreaterThan(p);
  });
});
