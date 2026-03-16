import type { AdaptationStrategy, AdaptationInput, AdaptationOutput } from "./strategies";
import { callClaude, parseClaudeJson, resolveClaudeConfig } from "./claude-util";

interface NewsletterResponse {
  subject: string;
  preheader: string;
  adaptedCopy: string;
  hashtags: string[];
}

export function createNewsletterFormatStrategy(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): AdaptationStrategy {
  const { apiKey, model } = resolveClaudeConfig(credentials, settings);

  return {
    async adapt(input: AdaptationInput): Promise<AdaptationOutput> {
      const system = `You are a newsletter content formatter. Take the original article and format it for a Substack newsletter.

${input.blueprintContent ? `BRAND CONTEXT:\n${input.blueprintContent}\n` : ""}
${input.spokespersonName ? `AUTHOR: ${input.spokespersonName}` : ""}

NEWSLETTER RULES:
- Write a compelling email subject line (under 60 characters)
- Write a preheader (under 100 characters, the preview text in email clients)
- Reformat the article for newsletter reading:
  - Add a personal opener addressing the reader directly
  - Break up long paragraphs for mobile reading
  - Add pull quotes or key takeaways as standalone lines
  - Include a personal sign-off from the author
  - End with a CTA (reply, share, visit website)
- Keep the substance identical to the original
- Add "Originally published at [website]" footer note if a canonical URL is provided
- Use markdown formatting (##, **, -, etc.)

ORIGINAL ARTICLE:
${input.originalCopy}

${input.title ? `ARTICLE TITLE: ${input.title}` : ""}

Format for newsletter. Respond with JSON (no code fences):
{
  "subject": "email subject line",
  "preheader": "email preheader text",
  "adaptedCopy": "full newsletter body in markdown",
  "hashtags": []
}`;

      const text = await callClaude(apiKey, model, system, "Format for newsletter now.", 8192);
      const result = parseClaudeJson<NewsletterResponse>(text);

      return {
        adaptedCopy: result.adaptedCopy,
        adaptedFirstComment: null,
        hashtags: result.hashtags || [],
        mentions: [],
        characterCount: result.adaptedCopy.length,
        threadParts: null,
        canonicalUrl: input.articleUrl || null,
        mediaUrls: null,
        metadata: {
          subject: result.subject,
          preheader: result.preheader,
        },
      };
    },
  };
}
