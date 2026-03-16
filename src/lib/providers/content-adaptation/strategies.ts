import type { AdaptationType, ContentType, DistributionPlatform } from "@/types/database";

// ============================================================
// Adaptation Strategy Pattern
// Each strategy handles a fundamentally different way of
// transforming content for a target platform. The resolver
// picks the right strategy based on the adaptation type.
// ============================================================

export interface AdaptationInput {
  originalCopy: string;
  originalFirstComment: string | null;
  contentType: ContentType;
  platform: DistributionPlatform;
  adaptationType: AdaptationType;
  maxChars: number;
  spokespersonName: string | null;
  blueprintContent?: string;
  // Content-type-specific context
  articleUrl?: string;
  downloadUrl?: string;
  videoUrl?: string;
  imageUrls?: string[];
  title?: string;
}

export interface AdaptationOutput {
  adaptedCopy: string;
  adaptedFirstComment: string | null;
  hashtags: string[];
  mentions: string[];
  characterCount: number;
  // Extended fields
  threadParts: string[] | null;
  canonicalUrl: string | null;
  mediaUrls: string[] | null;
  metadata: Record<string, unknown>;
}

export interface AdaptationStrategy {
  adapt(input: AdaptationInput): Promise<AdaptationOutput>;
}

/**
 * Resolve the correct adaptation strategy for a given adaptation type.
 * All strategies use Claude (via the company's content_generation API config)
 * but with different prompts tailored to each transformation.
 */
export async function resolveAdaptationStrategy(
  adaptationType: AdaptationType,
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): Promise<AdaptationStrategy> {
  switch (adaptationType) {
    case "thread_expand": {
      const { createThreadExpansionStrategy } = await import("./thread-expansion");
      return createThreadExpansionStrategy(credentials, settings);
    }
    case "newsletter_format": {
      const { createNewsletterFormatStrategy } = await import("./newsletter-format");
      return createNewsletterFormatStrategy(credentials, settings);
    }
    case "article_syndicate": {
      const { createArticleSyndicationStrategy } = await import("./article-syndication");
      return createArticleSyndicationStrategy(credentials, settings);
    }
    case "video_metadata": {
      const { createVideoMetadataStrategy } = await import("./video-metadata");
      return createVideoMetadataStrategy(credentials, settings);
    }
    case "copy_adapt":
    case "link_post":
    case "promo_post":
    case "caption_generate":
    default: {
      const { createSinglePostStrategy } = await import("./single-post");
      return createSinglePostStrategy(credentials, settings);
    }
  }
}
