import { describe, expect, it } from "vitest";
import { packFieldsForIndustry } from "./signup-pack";

describe("packFieldsForIndustry", () => {
  it("gives a hospitality signup the venue pack", () => {
    expect(packFieldsForIndustry("Hospitality")).toEqual({ post_pack: "hospitality", social_networks: ["facebook", "instagram"] });
    expect(packFieldsForIndustry(" hospitality ")).toEqual({ post_pack: "hospitality", social_networks: ["facebook", "instagram"] });
  });
  it("leaves every other industry on the defaults", () => {
    expect(packFieldsForIndustry("Healthcare")).toEqual({});
    expect(packFieldsForIndustry(null)).toEqual({});
    expect(packFieldsForIndustry(undefined)).toEqual({});
  });
});
