/**
 * The post types whose image the API production path draws itself.
 * One list, so a new image format is added here and not as another `||`
 * at every site that decides whether to render.
 */
export const PRODUCTION_IMAGE_TYPES = ["meme", "mini_infographic", "profile_statement"] as const;
export type ProductionImageType = (typeof PRODUCTION_IMAGE_TYPES)[number];

export function isProductionImageType(slug: unknown): slug is ProductionImageType {
  return typeof slug === "string" && (PRODUCTION_IMAGE_TYPES as readonly string[]).includes(slug);
}
