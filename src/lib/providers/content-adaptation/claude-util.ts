const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

interface AnthropicResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Shared Claude API call utility for all adaptation strategies.
 */
export async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string,
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
      messages: [{ role: "user", content: userMessage }],
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

/**
 * Parse JSON from Claude's response, stripping code fences if present.
 */
export function parseClaudeJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Failed to parse adaptation response as JSON. Raw: ${text.substring(0, 500)}`
    );
  }
}

/**
 * Resolve effective API key and model from credentials/settings.
 */
export function resolveClaudeConfig(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): { apiKey: string; model: string } {
  const apiKey = (credentials.api_key as string) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Content adaptation requires an Anthropic API key (either in provider config or ANTHROPIC_API_KEY env var)"
    );
  }
  const model = (settings.model as string) || DEFAULT_MODEL;
  return { apiKey, model };
}
