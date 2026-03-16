import type { ContentType, DistributionPlatform, AdaptationType } from "@/types/database";

// ============================================================
// Platform capability registry
// Static configuration that maps content types to platforms
// and their available adaptation strategies. Drives the UI
// dynamically — no more hardcoded platform lists in components.
// ============================================================

export interface PlatformCapability {
  platform: DistributionPlatform;
  label: string;
  shortLabel: string;
  color: string;          // Tailwind classes for badges/buttons
  maxChars: number;       // 0 = no limit
  supportedContentTypes: ContentType[];
  defaultAdaptationType: AdaptationType;
  alternativeAdaptations: AdaptationType[];
  category: "social" | "content" | "video";
}

export const PLATFORM_REGISTRY: PlatformCapability[] = [
  // ── Social Platforms ──────────────────────────────────────

  {
    platform: "linkedin_personal",
    label: "LinkedIn (Personal)",
    shortLabel: "LI",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    maxChars: 3000,
    supportedContentTypes: ["social_post", "linkedin_article", "blog_article", "video_script", "pdf_guide"],
    defaultAdaptationType: "copy_adapt",
    alternativeAdaptations: ["link_post", "promo_post"],
    category: "social",
  },
  {
    platform: "linkedin_company",
    label: "LinkedIn (Company)",
    shortLabel: "LI Co",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    maxChars: 3000,
    supportedContentTypes: ["social_post", "linkedin_article", "blog_article", "video_script", "pdf_guide"],
    defaultAdaptationType: "copy_adapt",
    alternativeAdaptations: ["link_post", "promo_post"],
    category: "social",
  },
  {
    platform: "twitter",
    label: "Twitter / X",
    shortLabel: "X",
    color: "bg-gray-100 text-gray-900 border-gray-300",
    maxChars: 280,
    supportedContentTypes: ["social_post", "blog_article", "video_script", "pdf_guide"],
    defaultAdaptationType: "copy_adapt",
    alternativeAdaptations: ["thread_expand", "link_post", "promo_post"],
    category: "social",
  },
  {
    platform: "bluesky",
    label: "Bluesky",
    shortLabel: "BS",
    color: "bg-sky-100 text-sky-700 border-sky-200",
    maxChars: 300,
    supportedContentTypes: ["social_post", "blog_article", "video_script", "pdf_guide"],
    defaultAdaptationType: "copy_adapt",
    alternativeAdaptations: ["thread_expand", "link_post", "promo_post"],
    category: "social",
  },
  {
    platform: "threads",
    label: "Threads",
    shortLabel: "TH",
    color: "bg-gray-100 text-gray-800 border-gray-200",
    maxChars: 500,
    supportedContentTypes: ["social_post", "blog_article", "pdf_guide"],
    defaultAdaptationType: "copy_adapt",
    alternativeAdaptations: ["link_post", "promo_post"],
    category: "social",
  },
  {
    platform: "facebook",
    label: "Facebook",
    shortLabel: "FB",
    color: "bg-blue-50 text-blue-800 border-blue-200",
    maxChars: 500, // Optimal, actual limit ~63K
    supportedContentTypes: ["social_post", "blog_article", "video_script", "pdf_guide"],
    defaultAdaptationType: "copy_adapt",
    alternativeAdaptations: ["link_post", "promo_post"],
    category: "social",
  },
  {
    platform: "instagram",
    label: "Instagram",
    shortLabel: "IG",
    color: "bg-pink-100 text-pink-700 border-pink-200",
    maxChars: 2200,
    supportedContentTypes: ["social_post", "video_script"],
    defaultAdaptationType: "caption_generate",
    alternativeAdaptations: ["copy_adapt"],
    category: "social",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    shortLabel: "TT",
    color: "bg-gray-900 text-white border-gray-700",
    maxChars: 2200,
    supportedContentTypes: ["social_post", "video_script"],
    defaultAdaptationType: "caption_generate",
    alternativeAdaptations: [],
    category: "social",
  },

  // ── Content / Newsletter Platforms ────────────────────────

  {
    platform: "substack",
    label: "Substack",
    shortLabel: "SS",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    maxChars: 0,
    supportedContentTypes: ["blog_article", "linkedin_article", "pdf_guide"],
    defaultAdaptationType: "newsletter_format",
    alternativeAdaptations: [],
    category: "content",
  },
  {
    platform: "medium",
    label: "Medium",
    shortLabel: "M",
    color: "bg-gray-100 text-gray-800 border-gray-300",
    maxChars: 0,
    supportedContentTypes: ["blog_article", "linkedin_article"],
    defaultAdaptationType: "article_syndicate",
    alternativeAdaptations: [],
    category: "content",
  },

  // ── Video Platforms ───────────────────────────────────────

  {
    platform: "youtube",
    label: "YouTube",
    shortLabel: "YT",
    color: "bg-red-100 text-red-700 border-red-200",
    maxChars: 5000,
    supportedContentTypes: ["video_script"],
    defaultAdaptationType: "video_metadata",
    alternativeAdaptations: [],
    category: "video",
  },
  {
    platform: "youtube_shorts",
    label: "YouTube Shorts",
    shortLabel: "YTS",
    color: "bg-red-100 text-red-700 border-red-200",
    maxChars: 100,
    supportedContentTypes: ["video_script"],
    defaultAdaptationType: "video_metadata",
    alternativeAdaptations: [],
    category: "video",
  },
];

// ============================================================
// Helper functions
// ============================================================

/** Get all platforms that support a given content type */
export function getPlatformsForContentType(contentType: ContentType): PlatformCapability[] {
  return PLATFORM_REGISTRY.filter((p) =>
    p.supportedContentTypes.includes(contentType)
  );
}

/** Get platforms grouped by category for a content type */
export function getPlatformsByCategory(contentType: ContentType): {
  social: PlatformCapability[];
  content: PlatformCapability[];
  video: PlatformCapability[];
} {
  const platforms = getPlatformsForContentType(contentType);
  return {
    social: platforms.filter((p) => p.category === "social"),
    content: platforms.filter((p) => p.category === "content"),
    video: platforms.filter((p) => p.category === "video"),
  };
}

/** Get all valid adaptation types for a platform + content type pair */
export function getAdaptationTypes(
  platform: DistributionPlatform,
  _contentType: ContentType
): AdaptationType[] {
  const cap = PLATFORM_REGISTRY.find((p) => p.platform === platform);
  if (!cap) return [];
  return [cap.defaultAdaptationType, ...cap.alternativeAdaptations];
}

/** Get the default adaptation type for a platform */
export function getDefaultAdaptationType(platform: DistributionPlatform): AdaptationType {
  const cap = PLATFORM_REGISTRY.find((p) => p.platform === platform);
  return cap?.defaultAdaptationType ?? "copy_adapt";
}

/** Get the character limit for a platform */
export function getCharLimit(platform: DistributionPlatform): number {
  const cap = PLATFORM_REGISTRY.find((p) => p.platform === platform);
  return cap?.maxChars ?? 0;
}

/** Look up a single platform capability */
export function getPlatformCapability(
  platform: DistributionPlatform
): PlatformCapability | undefined {
  return PLATFORM_REGISTRY.find((p) => p.platform === platform);
}

/** Get all platform labels as a lookup map */
export function getPlatformLabels(): Record<DistributionPlatform, string> {
  const labels = {} as Record<DistributionPlatform, string>;
  for (const p of PLATFORM_REGISTRY) {
    labels[p.platform] = p.label;
  }
  return labels;
}
