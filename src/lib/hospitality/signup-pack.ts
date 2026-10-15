/**
 * What a new company gets from the industry chosen at signup. The signup
 * page's "Hospitality" option means a venue: the hospitality pack, posting
 * to Facebook and Instagram. Anything else keeps the column defaults (the
 * business-to-business pack). Spread the result into the companies insert.
 */
export function packFieldsForIndustry(
  industry: unknown
): { post_pack: "hospitality"; social_networks: string[] } | Record<string, never> {
  if (typeof industry === "string" && industry.trim().toLowerCase() === "hospitality") {
    return { post_pack: "hospitality", social_networks: ["facebook", "instagram"] };
  }
  return {};
}
