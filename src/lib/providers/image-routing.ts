/**
 * Smart Image Provider Routing
 *
 * Routes image generation requests to the optimal provider based on
 * the image style/archetype. This maximises quality while minimising cost:
 *
 * ┌──────────────────────────┬──────────────────┬──────────┐
 * │ Image Style              │ Provider         │ Cost     │
 * ├──────────────────────────┼──────────────────┼──────────┤
 * │ Quote cards              │ Programmatic     │ $0       │
 * │ Carousels                │ Programmatic     │ $0       │
 * │ Editorial photography    │ Gemini Imagen    │ ~$0      │
 * │ Lifestyle photography    │ Gemini Imagen    │ ~$0      │
 * │ Healthcare scenes        │ Gemini Imagen    │ ~$0      │
 * │ Pixar/3D character       │ fal.ai Flux Pro  │ ~$0.05   │
 * │ Face-match (PuLID)       │ fal.ai Flux PuLID│ ~$0.08   │
 * └──────────────────────────┴──────────────────┴──────────┘
 *
 * The routing is transparent to the caller — they just specify the
 * image style and the router picks the best provider automatically.
 */

/**
 * Determines which image provider to use for a given image style.
 *
 * Returns the provider key (e.g. "gemini_imagen", "fal_flux")
 * and whether the image should be generated programmatically instead.
 */
export function routeImageStyle(styleSlug: string, hasReferencePhotos: boolean): {
  /** The provider to use for AI generation */
  provider: "gemini_imagen" | "fal_flux" | "openai_gpt_image";
  /** If true, skip AI generation — use programmatic (Satori+Sharp) instead */
  isProgrammatic: boolean;
  /** Reason for routing decision (for logging) */
  reason: string;
} {
  // Programmatic: quote cards and carousels (zero cost, perfect text)
  if (styleSlug === "quote_card" || styleSlug === "carousel_framework") {
    return {
      provider: "gemini_imagen", // won't be used, but needed for type
      isProgrammatic: true,
      reason: `${styleSlug} uses programmatic generation (Satori+Sharp)`,
    };
  }

  // Face-match: MUST use fal.ai PuLID (only provider that does this)
  if (hasReferencePhotos) {
    return {
      provider: "fal_flux",
      isProgrammatic: false,
      reason: "Reference photos provided — using fal.ai PuLID for face-consistent generation",
    };
  }

  // Pixar/3D styles: fal.ai Flux Pro (best at stylised 3D)
  const pixarStyles = ["pixar_3d", "pixar_healthcare", "pixar_fantasy", "3d_character", "3d_scene"];
  if (pixarStyles.includes(styleSlug)) {
    return {
      provider: "fal_flux",
      isProgrammatic: false,
      reason: `${styleSlug} routed to fal.ai Flux Pro (best for stylised 3D)`,
    };
  }

  // Everything else: Gemini Imagen (photography, editorial, healthcare scenes)
  // This covers: editorial_photo, lifestyle, healthcare_scene, real_photo,
  // flat_illustration, abstract, corporate, and any unknown styles
  return {
    provider: "gemini_imagen",
    isProgrammatic: false,
    reason: `${styleSlug} routed to Gemini Imagen (photorealistic, free tier)`,
  };
}

/**
 * Check if a Gemini API key is available.
 * Falls back to fal.ai if Gemini is not configured.
 */
export function isGeminiAvailable(): boolean {
  return !!process.env.GOOGLE_GEMINI_API_KEY;
}

/**
 * Get the effective provider, falling back if the preferred one is unavailable.
 */
export function getEffectiveProvider(
  preferred: "gemini_imagen" | "fal_flux" | "openai_gpt_image"
): "gemini_imagen" | "fal_flux" | "openai_gpt_image" {
  if (preferred === "gemini_imagen" && !isGeminiAvailable()) {
    // Fall back to fal.ai if Gemini isn't configured
    return "fal_flux";
  }
  return preferred;
}
