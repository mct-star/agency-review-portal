import type { AdaptationStrategy, AdaptationInput, AdaptationOutput } from "./strategies";
import { callClaude, parseClaudeJson, resolveClaudeConfig } from "./claude-util";

interface ThreadResponse {
  threadParts: string[];
  adaptedFirstComment: string | null;
  hashtags: string[];
  mentions: string[];
}

export function createThreadExpansionStrategy(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): AdaptationStrategy {
  const { apiKey, model } = resolveClaudeConfig(credentials, settings);

  return {
    async adapt(input: AdaptationInput): Promise<AdaptationOutput> {
      const platformName = input.platform === "bluesky" ? "Bluesky" : "Twitter/X";
      const perPartLimit = input.maxChars || 280;

      const system = `You are a social media thread creator. Take the original content and transform it into a compelling multi-part thread for ${platformName}.

${input.blueprintContent ? `BRAND CONTEXT:\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `AUTHOR: ${input.spokespersonName}` : ""}

THREAD RULES:
- Each part MUST be under ${perPartLimit} characters
- First part is the hook (most important — must stop the scroll)
- Break ideas into atomic, self-contained parts
- Use natural transitions ("Here's what I mean..." / "The result?" / "But here's the thing...")
- Last part should have a CTA or sign-off
- Aim for 3-8 parts depending on content depth
- DO NOT number the parts (1/, 2/ etc) unless the platform convention requires it
- Each part should work as a standalone insight if seen in isolation
- Include hashtags only in the last part

ORIGINAL CONTENT:
${input.originalCopy}

${input.originalFirstComment ? `ORIGINAL FIRST COMMENT (use as inspiration for engagement):\n${input.originalFirstComment}` : ""}

Create the thread. Respond with JSON (no code fences):
{
  "threadParts": ["part 1 text", "part 2 text", "..."],
  "adaptedFirstComment": "string or null (a reply to your own thread for engagement)",
  "hashtags": ["array", "of", "hashtags"],
  "mentions": ["array", "of", "mentions"]
}`;

      const text = await callClaude(apiKey, model, system, "Create the thread now.", 4096);
      const result = parseClaudeJson<ThreadResponse>(text);

      const totalChars = result.threadParts.reduce((sum, p) => sum + p.length, 0);

      return {
        adaptedCopy: result.threadParts[0] || "",
        adaptedFirstComment: result.adaptedFirstComment,
        hashtags: result.hashtags || [],
        mentions: result.mentions || [],
        characterCount: totalChars,
        threadParts: result.threadParts,
        canonicalUrl: null,
        mediaUrls: null,
        metadata: {
          partCount: result.threadParts.length,
          perPartLimit,
        },
      };
    },
  };
}
