import { describe, it, expect } from "vitest";
import { audienceCodesOf, parseBlogRequest, threeLayerBrief } from "./blog-request";

const good = {
  companyId: "c1", topicTitle: "Why procurement stalls a good launch", pillar: "P1",
  audienceTheme: "V", brandPillar: "systems", wordCountMax: 2200,
};

describe("parseBlogRequest", () => {
  it("accepts a request that names all three layers", () => {
    const r = parseBlogRequest({ ...good, topicId: "", additionalContext: "  " });
    expect(r).toEqual({ ok: true, value: { ...good, topicId: null, additionalContext: null } });
  });

  it("refuses a missing layer, naming what is missing", () => {
    expect(parseBlogRequest({ ...good, pillar: "P9" })).toEqual({ ok: false, error: "Choose a content pillar." });
    expect(parseBlogRequest({ ...good, audienceTheme: "" })).toMatchObject({ ok: false, error: expect.stringContaining("audience problem") });
    expect(parseBlogRequest({ ...good, brandPillar: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("brand pillar") });
  });

  it("refuses a length outside the method's 1,800 to 2,500", () => {
    expect(parseBlogRequest({ ...good, wordCountMax: 1200 })).toMatchObject({ ok: false });
    expect(parseBlogRequest({ ...good, wordCountMax: "2500" })).toMatchObject({ ok: true });
  });

  it("refuses an empty or junk body", () => {
    expect(parseBlogRequest(null)).toMatchObject({ ok: false });
    expect(parseBlogRequest({ ...good, topicTitle: "Hi" })).toMatchObject({ ok: false });
  });
});

describe("audienceCodesOf", () => {
  it("reads both the short codes and the older spelled-out themes", () => {
    expect(audienceCodesOf("A, V")).toEqual(["A", "V"]);
    expect(audienceCodesOf("Standing Out")).toEqual(["S"]);
    expect(audienceCodesOf("Revenue Architecture")).toEqual([]);
    expect(audienceCodesOf(null)).toEqual([]);
  });
});

describe("threeLayerBrief", () => {
  it("names each layer in full and keeps the brand pillar implicit", () => {
    const brief = threeLayerBrief(good);
    expect(brief).toContain("Getting Products to Market");
    expect(brief).toContain("Demonstrating Value");
    expect(brief).toContain("Systems That Transfer");
    expect(brief).toContain("never named in the copy");
    expect(brief).not.toMatch(/[–—]/);
  });
});
