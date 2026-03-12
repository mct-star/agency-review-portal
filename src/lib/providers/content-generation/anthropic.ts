/**
 * Anthropic Claude Content Generation Provider
 *
 * Uses the Anthropic Messages API to generate content pieces and
 * platform-adapted variants. The provider expects credentials with
 * an `api_key` field and optional settings like `model`.
 */

import type {
  ContentProvider,
  ContentGenerationInput,
  ContentGenerationOutput,
  PlatformAdaptationProvider,
  PlatformAdaptationInput,
  PlatformAdaptationOutput,
} from "../index";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: AnthropicMessage[],
  maxTokens: number = 4096
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data: AnthropicResponse = await res.json();
  const textBlock = data.content.find((c) => c.type === "text");
  if (!textBlock) throw new Error("No text content in Anthropic response");
  return textBlock.text;
}

// ── Content Generation ──────────────────────────────────────

const CONTENT_TYPE_INSTRUCTIONS: Record<string, string> = {
  social_post: `Write a LinkedIn social media post. Include:
- A compelling hook (first line that stops the scroll)
- 3-5 short paragraphs with insight, story, or framework
- A clear call-to-action
- Sign off with the spokesperson's name
- Generate a "first comment" (a follow-up comment the author posts immediately after)
- Post type should be one of: insight, story, framework, contrarian, list, question`,

  blog_article: `Write a full blog article (800-1200 words). Include:
- A compelling title (no colons or hyphens)
- An engaging opening paragraph
- 3-5 sections with subheadings (use ## for subheadings)
- Practical takeaways
- A conclusion with call-to-action
- Also generate: SEO title (60 chars max), meta description (155 chars max), URL slug, excerpt (2 sentences)`,

  linkedin_article: `Write a LinkedIn article (600-1000 words). Include:
- A thought-provoking title
- An opening that frames the problem
- 3-4 sections with clear subheadings
- Professional insights with real-world examples
- A conclusion that positions the author as an authority
- Also generate: SEO title, meta description, excerpt`,

  pdf_guide: `Write content for an 8-page PDF guide. Include:
- A title and subtitle
- An executive summary (1 paragraph)
- 4-6 main sections with actionable content
- Bullet points and numbered lists where appropriate
- A conclusion with next steps
- Also generate: cover page copy, back page CTA`,

  video_script: `Write a video script (3-5 minutes when read aloud). Include:
- Opening hook (first 5 seconds to capture attention)
- Main content divided into clear segments
- Transitions between segments
- Closing with call-to-action
- Also generate: intro/outro spec, B-roll timestamps`,
};

function buildContentPrompt(input: ContentGenerationInput): string {
  const typeInstructions =
    CONTENT_TYPE_INSTRUCTIONS[input.contentType] || CONTENT_TYPE_INSTRUCTIONS.social_post;

  return `You are a content generation assistant. Create high-quality content based on the company's blueprint and the assigned topic.

COMPANY BLUEPRINT:
${input.blueprintContent}

TOPIC: ${input.topicTitle}
${input.topicDescription ? `DESCRIPTION: ${input.topicDescription}` : ""}
${input.pillar ? `CONTENT PILLAR: ${input.pillar}` : ""}
${input.audienceTheme ? `AUDIENCE THEME: ${input.audienceTheme}` : ""}
WEEK: ${input.weekNumber}
${input.spokespersonName ? `SPOKESPERSON: ${input.spokespersonName}` : ""}
${input.additionalContext ? `\nADDITIONAL CONTEXT:\n${input.additionalContext}` : ""}

CONTENT TYPE: ${input.contentType}

${typeInstructions}

IMPORTANT RULES:
- Write in the voice and style described in the blueprint
- Reference healthcare-specific scenarios where relevant
- No em-dashes or en-dashes anywhere
- No colons or hyphens in titles or hooks
- Every claim should be grounded in the blueprint's expertise areas

Respond with a JSON object (no markdown code fences) matching this structure:
{
  "title": "string",
  "markdownBody": "string (the full content in markdown)",
  "firstComment": "string or null",
  "wordCount": number,
  "postType": "string or null (e.g. insight, story, framework)",
  "assets": [
    { "assetType": "seo_title", "textContent": "..." },
    { "assetType": "seo_meta_description", "textContent": "..." },
    { "assetType": "url_slug", "textContent": "..." },
    { "assetType": "excerpt", "textContent": "..." }
  ]
}

Only include assets that are relevant to this content type.`;
}

export function createClaudeContentProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ContentProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error(
      "Anthropic provider requires an api_key in credentials"
    );
  }
  const model = (settings.model as string) || DEFAULT_MODEL;

  return {
    async generate(input: ContentGenerationInput): Promise<ContentGenerationOutput> {
      const system = buildContentPrompt(input);
      const text = await callClaude(
        apiKey,
        model,
        system,
        [{ role: "user", content: "Generate the content now." }],
        8192
      );

      // Parse JSON response — strip any markdown fences if present
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        return JSON.parse(cleaned) as ContentGenerationOutput;
      } catch {
        throw new Error(
          `Failed to parse Claude response as JSON. Raw output: ${text.substring(0, 500)}`
        );
      }
    },
  };
}

// ── Platform Adaptation ─────────────────────────────────────

const PLATFORM_RULES: Record<string, string> = {
  twitter: `Twitter/X rules:
- Maximum 280 characters
- Short, punchy statements
- 2-3 relevant hashtags max
- No @mentions unless specifically relevant
- Thread format if content needs more space (but just give the first tweet)`,

  bluesky: `Bluesky rules:
- Maximum 300 characters
- Similar tone to Twitter but can be slightly longer
- No @mentions (different mention format)
- 2-3 hashtags max`,

  threads: `Threads rules:
- Maximum 500 characters
- Instagram-adjacent audience
- Slightly more casual tone
- Hashtags in body text (3-5)`,

  facebook: `Facebook rules:
- No strict character limit (but keep under 500 for engagement)
- Can be more conversational
- Include a question to drive comments
- 2-3 hashtags max`,

  instagram: `Instagram rules:
- Caption maximum 2200 characters
- First line is the hook (shows in preview)
- Up to 30 hashtags (put in first comment)
- Include emoji sparingly
- End with a CTA`,

  linkedin_personal: `LinkedIn Personal Profile rules:
- Maximum 3000 characters
- Professional but personal tone
- Hook in first 2 lines (before "see more")
- End with sign-off
- 3-5 hashtags`,

  linkedin_company: `LinkedIn Company Page rules:
- Maximum 3000 characters
- More formal/brand voice
- Include company perspective
- 3-5 hashtags
- CTA to company resources`,
};

export function createClaudePlatformAdaptationProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PlatformAdaptationProvider {
  const apiKey = credentials.api_key as string;
  // If no API key configured, we can still try if ANTHROPIC_API_KEY env is set
  const effectiveKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!effectiveKey) {
    throw new Error(
      "Platform adaptation requires an Anthropic API key (either in provider config or ANTHROPIC_API_KEY env var)"
    );
  }
  const model = (settings.model as string) || DEFAULT_MODEL;

  return {
    async adapt(input: PlatformAdaptationInput): Promise<PlatformAdaptationOutput> {
      const platformRules =
        PLATFORM_RULES[input.platform] || `Adapt for ${input.platform} (max ${input.maxChars} characters)`;

      const system = `You are a social media content adapter. Take the original post and adapt it for a specific platform while maintaining the core message and voice.

${input.blueprintContent ? `BRAND CONTEXT:\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `AUTHOR: ${input.spokespersonName}` : ""}

PLATFORM: ${input.platform}
${platformRules}

ORIGINAL POST:
${input.originalCopy}

${input.originalFirstComment ? `ORIGINAL FIRST COMMENT:\n${input.originalFirstComment}` : ""}

Adapt this content for ${input.platform}. Respond with JSON (no code fences):
{
  "adaptedCopy": "string (the adapted post)",
  "adaptedFirstComment": "string or null",
  "hashtags": ["array", "of", "hashtags"],
  "mentions": ["array", "of", "mentions"],
  "characterCount": number
}`;

      const text = await callClaude(
        effectiveKey,
        model,
        system,
        [{ role: "user", content: "Adapt the content now." }],
        2048
      );

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        return JSON.parse(cleaned) as PlatformAdaptationOutput;
      } catch {
        throw new Error(
          `Failed to parse adaptation response as JSON. Raw: ${text.substring(0, 500)}`
        );
      }
    },
  };
}
