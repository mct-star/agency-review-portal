import { describe, it, expect } from "vitest";
import { parseImageRecord, toSidecar } from "./blog-image-record";

describe("parseImageRecord", () => {
  it("reads a full record", () => {
    expect(parseImageRecord({ role: "inline", type: "diagram", passage: "Stage list", treatment: "watermark-a", alt: "A chart" }))
      .toEqual({ role: "inline", type: "diagram", passage: "Stage list", treatment: "watermark-a", alt: "A chart" });
  });
  it("is tolerant of null, empty and wrong shapes and never throws", () => {
    for (const v of [null, undefined, {}, [], "x", 3, { role: 4 }]) {
      expect(parseImageRecord(v)).toBeNull();
    }
  });
  it("keeps an unknown type as given so the gate can report it", () => {
    expect(parseImageRecord({ role: "hero", type: "cartoon", passage: "p" })?.type).toBe("cartoon");
  });
  it("keeps a record with a missing or unknown role", () => {
    expect(parseImageRecord({ type: "diagram", passage: "p" })).toEqual({ type: "diagram", passage: "p" });
    expect(parseImageRecord({ role: "banner", passage: "p" })).toEqual({ role: "banner", passage: "p" });
  });
  it("defaults a missing passage to empty and ignores wrong-typed fields", () => {
    expect(parseImageRecord({ role: "share", passage: 5, alt: 7, treatment: 1 })).toEqual({ role: "share", passage: "" });
  });
});

describe("toSidecar", () => {
  it("emits the shape the local script reads, omitting absent keys", () => {
    const out = toSidecar([
      { file: "/images/blog/a.jpg", record: { role: "hero", type: "diagram", passage: "p" } },
      { file: "/images/blog/a-og.jpg", record: { role: "share", passage: "card" } },
    ]);
    expect(out).toEqual({
      images: [
        { file: "/images/blog/a.jpg", role: "hero", type: "diagram", passage: "p" },
        { file: "/images/blog/a-og.jpg", role: "share", passage: "card" },
      ],
    });
    expect("type" in out.images[1]).toBe(false);
    expect("treatment" in out.images[0]).toBe(false);
  });
  it("includes treatment and alt when present, with the script's key order", () => {
    const out = toSidecar([{ file: "f.jpg", record: { role: "inline", type: "photograph", passage: "p", treatment: "watermark-a", alt: "Alt" } }]);
    expect(Object.keys(out.images[0])).toEqual(["file", "role", "type", "passage", "treatment", "alt"]);
  });
  it("round-trips through parseImageRecord", () => {
    const record = { role: "inline" as const, type: "infographic" as const, passage: "p", alt: "a" };
    const { images } = toSidecar([{ file: "f.jpg", record }]);
    expect(parseImageRecord(images[0])).toEqual(record);
  });
});

describe("the caption on a record (19 Nov 2026)", () => {
  it("reads and writes the caption", () => {
    const record = parseImageRecord({ role: "inline", passage: "p", alt: "Four steps", caption: "Fees begin here." });
    expect(record).toMatchObject({ alt: "Four steps", caption: "Fees begin here." });
    expect(toSidecar([{ file: "/i.png", record: record! }]).images[0]).toMatchObject({ caption: "Fees begin here." });
  });

  it("finds a record that holds only a caption", () => {
    expect(parseImageRecord({ caption: "Only this" })).toEqual({ passage: "", caption: "Only this" });
  });
});
