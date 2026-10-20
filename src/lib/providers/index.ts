/**
 * Provider Registry
 *
 * Resolves the active provider for a given company and service category.
 * Each provider module exports a common interface per service category:
 *
 *   - ContentProvider: generate() — produces markdown content
 *   - ImageProvider: generate() — produces image URLs
 *   - PlatformAdaptationProvider: adapt() — produces platform variants
 *   - VideoProvider: render() — produces video URLs
 *   - TranscriptionProvider: transcribe() — produces text from audio/video
 *
 * The registry reads from company_api_configs to determine which provider
 * to use, then returns the correct adapter with decrypted credentials.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/crypto";
import type { ServiceCategory } from "@/types/database";

// ── Provider interfaces ─────────────────────────────────────

export interface ContentGenerationInput {
  blueprintContent: string;
  /** Full source context doc (production rules, voice DNA, quality tests) */
  sourceContext?: string;
  topicTitle: string;
  topicDescription: string | null;
  pillar: string | null;
  audienceTheme: string | null;
  contentType: "social_post" | "blog_article" | "linkedin_article" | "pdf_guide" | "video_script";
  weekNumber: number;
  spokespersonName: string | null;
  additionalContext?: string;
  // Slot-specific fields (from posting_slots + post_types)
  postTypeSlug?: string;
  postTypeLabel?: string;
  templateInstructions?: string;
  wordCountMin?: number;
  wordCountMax?: number;
  imageArchetype?: string;
  ctaUrl?: string;
  ctaLinkText?: string;
  dayOfWeek?: number;
  scheduledTime?: string;
  slotLabel?: string;
  // Company-level context (from setup tables)
  signoffText?: string;
  firstCommentTemplate?: string;
  voiceDescription?: string;
  bannedVocabulary?: string;
  signatureDevices?: string;
  /** Full structured voice prompt (from buildVoicePrompt). When present, takes precedence over individual voice fields. */
  voicePrompt?: string;
  /** Company industry/sector — used to contextualise content (e.g. "healthcare", "fintech", "construction") */
  companyIndustry?: string;
  /** Company description — provides context for content generation */
  companyDescription?: string;
  // Weekly ecosystem references
  blogTitle?: string;
  blogUrl?: string;
  /** Pre-generation context from the Content Intelligence Layer (day-specific rules, hook tension, etc.) */
  preGenerationContext?: string;
  /** The company's image brand context (company_blueprints.derived_brand_context): governs the image prompts the writer returns. */
  brandContext?: string;
}

export interface ContentGenerationOutput {
  title: string;
  markdownBody: string;
  firstComment: string | null;
  wordCount: number;
  postType: string | null;
  imagePrompt: string | null;
  assets: {
    assetType: string;
    textContent: string;
  }[];
  /** Anything the caller should tell the user (for example, metadata the writer did not return). */
  warnings?: string[];
  /** Identity of the model that produced this specific result. */
  writer?: import("./text-runtime").WriterIdentity;
}

export interface ContentProvider {
  generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
}

export interface ImageGenerationInput {
  prompt: string;
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3";
  count?: number;
  /** Reference face/subject photo URLs for character consistency (e.g. Pixar scenes) */
  referenceImageUrls?: string[];
}

export interface ImageGenerationOutput {
  images: {
    url: string;
    filename: string;
  }[];
}

export interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}

export interface PlatformAdaptationInput {
  originalCopy: string;
  originalFirstComment: string | null;
  platform: string;
  maxChars: number;
  spokespersonName: string | null;
  blueprintContent?: string;
}

export interface PlatformAdaptationOutput {
  adaptedCopy: string;
  adaptedFirstComment: string | null;
  hashtags: string[];
  mentions: string[];
  characterCount: number;
}

export interface PlatformAdaptationProvider {
  adapt(input: PlatformAdaptationInput): Promise<PlatformAdaptationOutput>;
}

export interface VideoRenderInput {
  /** The video script/storyboard content */
  script: string;
  /** Intro/outro specification */
  introOutroSpec: string | null;
  /** B-roll timestamp markers from the script */
  brollTimestamps: string | null;
  /** Title overlay text */
  title: string;
  /** Speaker name for lower-third */
  speakerName: string | null;
  /** Brand colour hex for overlays */
  brandColor: string | null;
  /** Aspect ratio */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Duration target in seconds */
  targetDuration?: number;
  /** URLs of images/clips to include as B-roll */
  mediaUrls?: string[];
}

export interface VideoRenderOutput {
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  format: string;
  resolution: string;
}

export interface VideoProvider {
  render(input: VideoRenderInput): Promise<VideoRenderOutput>;
}

export interface TranscriptionInput {
  /** URL or path to the audio/video file */
  mediaUrl: string;
  /** Language hint (ISO 639-1, e.g. "en") */
  language?: string;
  /** Whether to include timestamps */
  includeTimestamps?: boolean;
  /** Whether to identify different speakers */
  diarize?: boolean;
}

export interface TranscriptionOutput {
  text: string;
  segments: {
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }[];
  language: string;
  durationSeconds: number;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}

// ── Provider config resolution ──────────────────────────────

export interface ResolvedProvider {
  provider: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
}

/**
 * Look up the active provider for a company + service category.
 * Returns null if no active config exists.
 */
export async function resolveProvider(
  companyId: string,
  serviceCategory: ServiceCategory
): Promise<ResolvedProvider | null> {
  return resolveProviderConfig(companyId, serviceCategory);
}

/** Read one company's retained alternate writer, even while it is inactive. */
export async function resolveStoredWritingProvider(companyId: string, provider: "anthropic_claude" | "openai_gpt4"): Promise<ResolvedProvider | null> {
  return resolveProviderConfig(companyId, "content_generation", provider);
}

async function resolveProviderConfig(companyId: string, serviceCategory: ServiceCategory, storedProvider?: string): Promise<ResolvedProvider | null> {
  const supabase = await createAdminSupabaseClient();

  let query = supabase
    .from("company_api_configs")
    .select("*")
    .eq("company_id", companyId)
    .eq("service_category", serviceCategory);
  query = storedProvider ? query.eq("provider", storedProvider) : query.eq("is_active", true);
  const { data: config, error } = await query.maybeSingle();

  if (error) throw new Error("Could not resolve the company provider configuration.");
  if (!config) return null;

  let credentials: Record<string, unknown> = {};
  if (config.credentials_encrypted) {
    try {
      credentials = decryptJson(config.credentials_encrypted);
    } catch {
      throw new Error(
        `Failed to decrypt credentials for ${serviceCategory} provider "${config.provider}". ` +
          "Check that ENCRYPTION_KEY matches the key used during setup."
      );
    }
  }

  return {
    provider: config.provider,
    credentials,
    settings: { ...(config.provider_settings || {}), provider: config.provider },
  };
}

// ── Content provider factory ────────────────────────────────

/**
 * Get the content generation provider for a company.
 * Uses shared server funding only when this company has no active configuration.
 */
export async function getContentProvider(companyId: string): Promise<{ provider: ContentProvider; providerName: string }> {
  const { resolveTextConfig } = await import("./text-runtime");
  const config = await resolveTextConfig(companyId);
  const { createClaudeContentProvider } = await import("./content-generation/anthropic");
  return {
    providerName: config.provider === "claude" ? "anthropic_claude" : "openai_gpt4",
    provider: createClaudeContentProvider({ api_key: config.apiKey }, { ...config.settings, provider: config.provider }, config),
  };
}

/** Resolve adaptation through the same company policy as the content writer. */
export async function getPlatformAdaptationProvider(companyId: string): Promise<{ provider: PlatformAdaptationProvider; providerName: string }> {
  const { resolveTextConfig } = await import("./text-runtime");
  const config = await resolveTextConfig(companyId);
  const { createClaudePlatformAdaptationProvider } = await import("./content-generation/anthropic");
  return {
    providerName: config.provider === "claude" ? "anthropic_claude" : "openai_gpt4",
    provider: createClaudePlatformAdaptationProvider({ api_key: config.apiKey }, { ...config.settings, provider: config.provider }, config),
  };
}

/**
 * Get the image generation provider for a company.
 */
export async function getImageProvider(
  companyId: string
): Promise<{ provider: ImageProvider; providerName: string }> {
  const resolved = await resolveProvider(companyId, "image_generation");

  if (!resolved) {
    return {
      providerName: "none",
      provider: {
        async generate() {
          throw new Error(
            "No image generation provider configured for this company. " +
              "Go to Admin > Companies > [Company] > API Providers to set one up."
          );
        },
      },
    };
  }

  switch (resolved.provider) {
    case "fal_flux": {
      const { createFalImageProvider } = await import(
        "./image-generation/fal"
      );
      return {
        providerName: resolved.provider,
        provider: createFalImageProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }

    case "ideogram": {
      const { createIdeogramImageProvider } = await import(
        "./image-generation/ideogram"
      );
      return {
        providerName: resolved.provider,
        provider: createIdeogramImageProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }

    case "runway": {
      const { createRunwayImageProvider } = await import(
        "./image-generation/runway"
      );
      return {
        providerName: resolved.provider,
        provider: createRunwayImageProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }

    case "manus":
      // Retired. A company config may still name it.
      return {
        providerName: resolved.provider,
        provider: {
          async generate() {
            throw new Error("This image provider is retired. Ask AGENCY to switch it.");
          },
        },
      };

    case "gemini_imagen": {
      const { createGeminiImageProvider } = await import(
        "./image-generation/gemini"
      );
      return {
        providerName: resolved.provider,
        provider: createGeminiImageProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }

    case "openai_gpt_image":
    default: {
      const { createOpenAIImageProvider } = await import(
        "./image-generation/openai"
      );
      return {
        providerName: resolved.provider,
        provider: createOpenAIImageProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }
  }
}

// ── Image provider metadata (for UI) ────────────────────────

export const IMAGE_PROVIDER_OPTIONS = [
  {
    value: "openai_gpt_image",
    label: "OpenAI (DALL-E / GPT Image)",
    description: "High quality, good at following prompts. ~$0.04-0.08/image",
    costTier: "medium" as const,
  },
  {
    value: "fal_flux",
    label: "fal.ai (Flux)",
    description: "Fast and cheap. Flux Schnell ~$0.003/image, Pro ~$0.05/image",
    costTier: "low" as const,
  },
  {
    value: "ideogram",
    label: "Ideogram",
    description: "Best for text-in-image (quote cards, infographics). ~$0.04-0.08/image",
    costTier: "medium" as const,
  },
  {
    value: "runway",
    label: "Runway (Gen-3)",
    description: "Strong at stylised visuals. Async processing. ~$0.05-0.10/image",
    costTier: "high" as const,
  },
  {
    value: "gemini_imagen",
    label: "Google Gemini (Imagen 3)",
    description: "Photorealistic, editorial, healthcare scenes. Free with Google Workspace. Best for photography styles.",
    costTier: "free" as const,
  },
];

// ── Video provider factory ──────────────────────────────────

/**
 * Get the video rendering provider for a company.
 * Supports Shotstack, Creatomate, or JSON2Video.
 */
export async function getVideoProvider(
  companyId: string
): Promise<{ provider: VideoProvider; providerName: string }> {
  const resolved = await resolveProvider(companyId, "video_rendering");

  if (!resolved) {
    return {
      providerName: "none",
      provider: {
        async render() {
          throw new Error(
            "No video rendering provider configured for this company. " +
              "Go to Admin > Companies > [Company] > API Providers to set one up."
          );
        },
      },
    };
  }

  switch (resolved.provider) {
    case "shotstack":
    default: {
      const { createShotstackVideoProvider } = await import(
        "./video-rendering/shotstack"
      );
      return {
        providerName: resolved.provider,
        provider: createShotstackVideoProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }
  }
}

// ── Transcription provider factory ──────────────────────────

/**
 * Get the transcription provider for a company.
 * Supports OpenAI Whisper or Deepgram.
 */
export async function getTranscriptionProvider(
  companyId: string
): Promise<{ provider: TranscriptionProvider; providerName: string }> {
  const resolved = await resolveProvider(companyId, "transcription");

  if (!resolved) {
    return {
      providerName: "none",
      provider: {
        async transcribe() {
          throw new Error(
            "No transcription provider configured for this company. " +
              "Go to Admin > Companies > [Company] > API Providers to set one up."
          );
        },
      },
    };
  }

  switch (resolved.provider) {
    case "openai_whisper":
    default: {
      const { createWhisperTranscriptionProvider } = await import(
        "./transcription/openai-whisper"
      );
      return {
        providerName: resolved.provider,
        provider: createWhisperTranscriptionProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }
  }
}
