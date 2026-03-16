import type { AdaptationStrategy, AdaptationInput, AdaptationOutput } from "./strategies";
import { callClaude, parseClaudeJson, resolveClaudeConfig } from "./claude-util";

interface SyndicationResponse {
  adaptedCopy: string;
  subtitle: string;
  tags: string[];
}

export function createArticleSyndicationStrategy(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): AdaptationStrategy {
  const { apiKey, model } = resolveClaudeConfig(credentials, settings);

  return {
    async adapt(input: AdaptationInput): Promise<AdaptationOutput> {
      const system = `You are a content syndication formatter. Take the original article and prepare it for cross-posting to ${input.platform === "medium" ? "Medium" : input.platform}.

${input.blueprintContent ? `BRAND CONTEXT:\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `AUTHOR: ${input.spokespersonName}` : ""}

SYNDICATION RULES:
- Keep the article substance identical
- Adjust formatting for the target platform:
  - Medium: Use medium-style formatting (no excessive markdown headers, clean paragraph breaks)
  - Clean up any platform-specific markup from the original
- Add a footer: "This article was originally published at [canonical URL]"
- Generate a subtitle (Medium's kicker line, 140 chars max)
- Generate 3-5 content tags for the platform's tag system
- Do NOT change the article's argument or conclusions
- Do NOT add content that wasn't in the original

ORIGINAL ARTICLE:
${input.originalCopy}

${input.title ? `ARTICLE TITLE: ${input.title}` : ""}
${input.articleUrl ? `CANONICAL URL: ${input.articleUrl}` : ""}

Format for syndication. Respond with JSON (no code fences):
{
  "adaptedCopy": "full article text formatted for the platform",
  "subtitle": "article subtitle/kicker",
  "tags": ["tag1", "tag2", "tag3"]
}`;

      const text = await callClaude(apiKey, model, system, "Format for syndication now.", 8192);
      const result = parseClaudeJson<SyndicationResponse>(text);

      return {
        adaptedCopy: result.adaptedCopy,
        adaptedFirstComment: null,
        hashtags: result.tags || [],
        mentions: [],
        characterCount: result.adaptedCopy.length,
        threadParts: null,
        canonicalUrl: input.articleUrl || null,
        mediaUrls: null,
        metadata: {
          subtitle: result.subtitle,
          tags: result.tags,
        },
      };
    },
  };
}
