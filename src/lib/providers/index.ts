/**
 * Provider Registry
 *
 * Resolves the active provider for a given company and service category.
 * Each provider module exports a common interface per service category:
 *
 *   - ContentProvider: generate() — produces markdown content
 *   - ImageProvider: generate() — produces image URLs
 *   - PlatformAdaptationProvider: adapt() — produces platform variants
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
  topicTitle: string;
  topicDescription: string | null;
  pillar: string | null;
  audienceTheme: string | null;
  contentType: "social_post" | "blog_article" | "linkedin_article" | "pdf_guide" | "video_script";
  weekNumber: number;
  spokespersonName: string | null;
  additionalContext?: string;
}

export interface ContentGenerationOutput {
  title: string;
  markdownBody: string;
  firstComment: string | null;
  wordCount: number;
  postType: string | null;
  assets: {
    assetType: string;
    textContent: string;
  }[];
}

export interface ContentProvider {
  generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
}

export interface ImageGenerationInput {
  prompt: string;
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3";
  count?: number;
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
  const supabase = await createAdminSupabaseClient();

  const { data: config } = await supabase
    .from("company_api_configs")
    .select("*")
    .eq("company_id", companyId)
    .eq("service_category", serviceCategory)
    .eq("is_active", true)
    .single();

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
    settings: config.provider_settings || {},
  };
}

// ── Content provider factory ────────────────────────────────

/**
 * Get the content generation provider for a company.
 * Falls back to a stub provider if none is configured.
 */
export async function getContentProvider(
  companyId: string
): Promise<{ provider: ContentProvider; providerName: string }> {
  const resolved = await resolveProvider(companyId, "content_generation");

  if (!resolved) {
    // Return a stub that explains no provider is configured
    return {
      providerName: "none",
      provider: {
        async generate() {
          throw new Error(
            "No content generation provider configured for this company. " +
              "Go to Admin > Companies > [Company] > API Providers to set one up."
          );
        },
      },
    };
  }

  // For now, all content generation goes through Claude (Anthropic API)
  // Additional providers can be added here as switch cases
  switch (resolved.provider) {
    case "anthropic_claude":
    default: {
      const { createClaudeContentProvider } = await import(
        "./content-generation/anthropic"
      );
      return {
        providerName: resolved.provider,
        provider: createClaudeContentProvider(
          resolved.credentials,
          resolved.settings
        ),
      };
    }
  }
}

/**
 * Get the platform adaptation provider for a company.
 * Platform adaptation always uses Claude regardless of content_generation config.
 */
export async function getPlatformAdaptationProvider(
  companyId: string
): Promise<{ provider: PlatformAdaptationProvider; providerName: string }> {
  const resolved = await resolveProvider(companyId, "content_generation");

  // Platform adaptation always uses Claude
  const { createClaudePlatformAdaptationProvider } = await import(
    "./content-generation/anthropic"
  );

  return {
    providerName: resolved?.provider || "anthropic_claude",
    provider: createClaudePlatformAdaptationProvider(
      resolved?.credentials || {},
      resolved?.settings || {}
    ),
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
