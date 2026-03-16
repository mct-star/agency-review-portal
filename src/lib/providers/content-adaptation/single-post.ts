import type { AdaptationStrategy, AdaptationInput, AdaptationOutput } from "./strategies";
import { callClaude, parseClaudeJson, resolveClaudeConfig } from "./claude-util";

const PLATFORM_RULES: Record<string, string> = {
  twitter: `Twitter/X rules:
- Maximum 280 characters
- Short, punchy statements
- 2-3 relevant hashtags max
- No @mentions unless specifically relevant`,

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

  tiktok: `TikTok rules:
- Caption maximum 2200 characters
- Very casual, energetic tone
- First line hooks attention
- 3-5 trending hashtags
- Reference the visual/video content`,

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

  substack: `Substack rules:
- Newsletter-style preview/teaser
- Conversational, newsletter tone
- Include a compelling reason to open
- No hashtags needed`,

  medium: `Medium rules:
- Article preview teaser
- Thoughtful, essay-like tone
- Include a hook that makes readers want to click through
- No hashtags`,
};

function buildPrompt(input: AdaptationInput): string {
  const rules = PLATFORM_RULES[input.platform] || `Adapt for ${input.platform} (max ${input.maxChars} characters)`;

  let instruction: string;
  switch (input.adaptationType) {
    case "link_post":
      instruction = `Create a short, compelling post to share this article link. Include a hook that makes people want to click. The URL will be appended automatically, so do NOT include any placeholder URLs.`;
      break;
    case "promo_post":
      instruction = `Create a promotional post for this PDF guide/resource. Highlight the key value proposition and include a CTA to download. The download URL will be appended automatically.`;
      break;
    case "caption_generate":
      instruction = `Create an image/video caption for this content. Focus on what the viewer sees and the key takeaway. Make it engaging and platform-native.`;
      break;
    default: // copy_adapt
      instruction = `Adapt this content for the specified platform while maintaining the core message and voice.`;
  }

  return `You are a social media content adapter. ${instruction}

${input.blueprintContent ? `BRAND CONTEXT:\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `AUTHOR: ${input.spokespersonName}` : ""}

PLATFORM: ${input.platform}
${rules}

ORIGINAL POST:
${input.originalCopy}

${input.originalFirstComment ? `ORIGINAL FIRST COMMENT:\n${input.originalFirstComment}` : ""}

Adapt this content. Respond with JSON (no code fences):
{
  "adaptedCopy": "string (the adapted post, max ${input.maxChars} chars)",
  "adaptedFirstComment": "string or null",
  "hashtags": ["array", "of", "hashtags"],
  "mentions": ["array", "of", "mentions"],
  "characterCount": number
}`;
}

interface SinglePostResponse {
  adaptedCopy: string;
  adaptedFirstComment: string | null;
  hashtags: string[];
  mentions: string[];
  characterCount: number;
}

export function createSinglePostStrategy(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): AdaptationStrategy {
  const { apiKey, model } = resolveClaudeConfig(credentials, settings);

  return {
    async adapt(input: AdaptationInput): Promise<AdaptationOutput> {
      const system = buildPrompt(input);
      const text = await callClaude(apiKey, model, system, "Adapt the content now.", 2048);
      const result = parseClaudeJson<SinglePostResponse>(text);

      return {
        adaptedCopy: result.adaptedCopy,
        adaptedFirstComment: result.adaptedFirstComment,
        hashtags: result.hashtags || [],
        mentions: result.mentions || [],
        characterCount: result.characterCount || result.adaptedCopy.length,
        threadParts: null,
        canonicalUrl: null,
        mediaUrls: null,
        metadata: {},
      };
    },
  };
}
