import { describe, expect, it } from "vitest";
import { buildRunBody, captionStyleLabel } from "./caption-style";

describe("buildRunBody", () => {
  it("sends exactly {contentPieceId} for Auto", () => {
    expect(buildRunBody("p1", "auto")).toEqual({ contentPieceId: "p1" });
    expect(Object.keys(buildRunBody("p1", "auto"))).toEqual(["contentPieceId"]);
  });
  it("adds caption_style for Editorial and Chest", () => {
    expect(buildRunBody("p1", "editorial")).toEqual({ contentPieceId: "p1", caption_style: "editorial" });
    expect(buildRunBody("p1", "chest")).toEqual({ contentPieceId: "p1", caption_style: "chest" });
  });
});

describe("captionStyleLabel", () => {
  it("is null for a missing verify", () => {
    expect(captionStyleLabel(null)).toBeNull();
  });
  it("is null for a missing captionStyle", () => {
    expect(captionStyleLabel({})).toBeNull();
    expect(captionStyleLabel({ effectiveStyle: "chest" })).toBeNull();
  });
  it("shows the chosen style alone when used matches or is absent", () => {
    expect(captionStyleLabel({ captionStyle: "editorial" })).toBe("Captions: Editorial");
    expect(captionStyleLabel({ captionStyle: "chest", effectiveStyle: "chest" })).toBe("Captions: Chest");
  });
  it("shows the style used when it differs", () => {
    expect(captionStyleLabel({ captionStyle: "auto", effectiveStyle: "editorial" })).toBe(
      "Captions: Auto (used Editorial)"
    );
  });
});
