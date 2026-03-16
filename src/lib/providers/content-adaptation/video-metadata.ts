import type { AdaptationStrategy, AdaptationInput, AdaptationOutput } from "./strategies";
import { callClaude, parseClaudeJson, resolveClaudeConfig } from "./claude-util";

interface VideoMetadataResponse {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  caption: string;
}

export function createVideoMetadataStrategy(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): AdaptationStrategy {
  const { apiKey, model } = resolveClaudeConfig(credentials, settings);

  return {
    async adapt(input: AdaptationInput): Promise<AdaptationOutput> {
      const platformNames: Record<string, string> = {
        youtube: "YouTube",
        youtube_shorts: "YouTube Shorts",
        tiktok: "TikTok",
        instagram: "Instagram Reels",
      };
      const platformName = platformNames[input.platform] || input.platform;

      const isShortForm = ["youtube_shorts", "tiktok", "instagram"].includes(input.platform);

      const system = `You are a video metadata specialist. Generate optimised title, description, tags, and caption for uploading a video to ${platformName}.

${input.blueprintContent ? `BRAND CONTEXT:\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `CREATOR: ${input.spokespersonName}` : ""}

PLATFORM: ${platformName}
FORMAT: ${isShortForm ? "Short-form vertical video (under 60 seconds)" : "Long-form video"}

PLATFORM-SPECIFIC RULES:
${input.platform === "youtube" ? `- Title: max 100 characters, keyword-rich, compelling
- Description: 200-500 words, include timestamps if the script has sections
- Tags: 10-15 relevant tags for discoverability
- Include relevant links and CTAs in description` : ""}
${input.platform === "youtube_shorts" ? `- Title: max 100 characters, hook-driven
- Description: 1-2 sentences max
- Tags: 5-8 relevant tags
- Hashtags: #Shorts plus 2-3 topical ones` : ""}
${input.platform === "tiktok" ? `- Caption: max 2200 characters, casual and engaging
- Hashtags: 3-5 trending + niche hashtags
- No description field (caption IS the description)
- Include a hook in the first line` : ""}
${input.platform === "instagram" ? `- Caption: max 2200 characters, engaging
- Hashtags: up to 30, mix of popular and niche
- Include a CTA (save, share, follow)` : ""}

VIDEO SCRIPT / CONTENT:
${input.originalCopy}

${input.title ? `WORKING TITLE: ${input.title}` : ""}

Generate the metadata. Respond with JSON (no code fences):
{
  "title": "optimised video title",
  "description": "full video description",
  "tags": ["tag1", "tag2"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "caption": "social caption for the video post"
}`;

      const text = await callClaude(apiKey, model, system, "Generate video metadata now.", 4096);
      const result = parseClaudeJson<VideoMetadataResponse>(text);

      return {
        adaptedCopy: result.caption || result.description,
        adaptedFirstComment: null,
        hashtags: result.hashtags || [],
        mentions: [],
        characterCount: (result.caption || result.description).length,
        threadParts: null,
        canonicalUrl: null,
        mediaUrls: input.videoUrl ? [input.videoUrl] : null,
        metadata: {
          title: result.title,
          description: result.description,
          tags: result.tags,
          caption: result.caption,
        },
      };
    },
  };
}
