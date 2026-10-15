/**
 * The one place a Claude model id is chosen and a text call is made.
 *
 * Every Claude call in the platform goes through callText (or the
 * string-returning callClaude wrapper). It knows two things the routes must
 * not: which model ids are current, and how the Claude 5.5 models behave
 * (they reject `temperature`, they think by default and the thinking block
 * comes first, so thinking is switched off and the first text block is read).
 * Effort is low unless the caller asks for more: Sonnet for writing, Haiku
 * for classification, medium effort only for the post and blog writer.
 *
 * Fallback order (decided 14 Oct 2026): Claude, then Gemini 2.5 Flash. Gemini
 * Pro has a quota of zero on the production key and the OpenAI key is
 * invalid, so neither is in the chain. The result says which provider and
 * model actually answered, so a job record can tell the truth.
 */

const API_URL = "https://api.anthropic.com/v1/messages";

export const CLAUDE_SONNET = "claude-sonnet-5-5";
export const CLAUDE_HAIKU = "claude-haiku-5-5";
export const GEMINI_FLASH = "gemini-2.5-flash";

/** Model ids that were retired and now return 404, mapped to the current family member. */
const RETIRED: Record<string, string> = {
  "claude-sonnet-4-20250514": CLAUDE_SONNET,
  "claude-opus-4-20250514": CLAUDE_SONNET,
  "claude-3-5-haiku-20241022": CLAUDE_HAIKU,
  "claude-haiku-4-20250514": CLAUDE_HAIKU,
  "claude-3-5-sonnet-20241022": CLAUDE_SONNET,
  "claude-3-7-sonnet-20250219": CLAUDE_SONNET,
};

/**
 * The model to send for a requested id. A stored setting may still name a
 * retired id (the seed script wrote one into company_api_configs), so anything
 * unknown is mapped to the current Sonnet, and anything in the haiku family
 * to the current Haiku.
 */
export function currentClaudeModel(requested?: string | null): string {
  if (!requested) return CLAUDE_SONNET;
  if (requested === CLAUDE_SONNET || requested === CLAUDE_HAIKU || requested === "claude-opus-5-5") return requested;
  if (RETIRED[requested]) return RETIRED[requested];
  return /haiku/i.test(requested) ? CLAUDE_HAIKU : CLAUDE_SONNET;
}

export interface TextCallResult {
  text: string;
  provider: "claude" | "gemini";
  model: string;
}

export function geminiKey(): string {
  return process.env.GOOGLE_GEMINI_API_KEY || "";
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
}

export type ClaudeEffort = "low" | "medium" | "high";

async function callAnthropic(apiKey: string, model: string, system: string, userMessage: string, maxTokens: number, effort: ClaudeEffort): Promise<string> {
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
      // No temperature: the 5.5 models reject it (400).
      // Thinking off: it is on by default and its tokens count against max_tokens.
      thinking: { type: "between_tools" },
      output_config: { effort },
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic (${res.status}): ${await res.text()}`);
  const data: AnthropicResponse = await res.json();
  const textBlock = data.content?.find((c) => c.type === "text");
  if (!textBlock?.text) throw new Error("No text content in Anthropic response");
  return textBlock.text;
}

async function callGeminiFlash(key: string, system: string, userMessage: string, maxTokens: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ parts: [{ text: userMessage }] }],
        // Flash thinks before it answers and those tokens count against
        // maxOutputTokens, so thinking is switched off.
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${GEMINI_FLASH} (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error(`Gemini ${GEMINI_FLASH} returned empty response`);
  return text;
}

/** The sentinel resolveClaudeConfig returns when there is no Anthropic key at all. */
export const NO_ANTHROPIC_KEY = "no-anthropic-key-will-fallback-to-gemini";

/**
 * Claude first, Gemini Flash second. Throws when both fail or neither key is
 * set. The error names the providers that were tried; callers must not pass
 * that text to a client.
 */
export async function callText(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string,
  maxTokens: number = 4096,
  opts: { effort?: ClaudeEffort } = {}
): Promise<TextCallResult> {
  const errors: string[] = [];
  const claudeModel = currentClaudeModel(model);

  if (apiKey && apiKey !== NO_ANTHROPIC_KEY) {
    try {
      const text = await callAnthropic(apiKey, claudeModel, system, userMessage, maxTokens, opts.effort ?? "low");
      return { text, provider: "claude", model: claudeModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Claude: ${msg}`);
      console.warn("[callText] Claude failed:", msg.slice(0, 200));
    }
  }

  const gKey = geminiKey();
  if (gKey) {
    try {
      const text = await callGeminiFlash(gKey, system, userMessage, maxTokens);
      return { text, provider: "gemini", model: GEMINI_FLASH };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Gemini Flash: ${msg}`);
      console.warn("[callText] Gemini Flash failed:", msg.slice(0, 200));
    }
  }

  // The raw provider text stays in the server log; it can carry vendor names and request detail.
  console.error("[callText] all providers failed:", errors.join(" | ").slice(0, 1000));
  throw new Error("The writing assistant could not complete this request. Please try again, or ask AGENCY to check it.");
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * Text from a picture plus a prompt (reading a chalkboard or a flyer). Same
 * rules as callText: no temperature, thinking off, the first text block,
 * Claude first and Gemini Flash (with the image inline) second.
 */
export async function callTextWithImage(
  apiKey: string,
  model: string,
  system: string,
  userText: string,
  imageBase64: string,
  mediaType: ImageMediaType,
  maxTokens: number = 2000
): Promise<TextCallResult> {
  const errors: string[] = [];
  const claudeModel = currentClaudeModel(model);

  if (apiKey && apiKey !== NO_ANTHROPIC_KEY) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: maxTokens,
          thinking: { type: "between_tools" },
          output_config: { effort: "low" },
          ...(system ? { system } : {}),
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
                { type: "text", text: userText },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic (${res.status}): ${await res.text()}`);
      const data: AnthropicResponse = await res.json();
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock?.text) throw new Error("No text content in Anthropic response");
      return { text: textBlock.text, provider: "claude", model: claudeModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Claude: ${msg}`);
      console.warn("[callTextWithImage] Claude failed:", msg.slice(0, 200));
    }
  }

  const gKey = geminiKey();
  if (gKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent?key=${gKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: imageBase64 } }, { text: userText }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${GEMINI_FLASH} (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error(`Gemini ${GEMINI_FLASH} returned empty response`);
      return { text, provider: "gemini", model: GEMINI_FLASH };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Gemini Flash: ${msg}`);
      console.warn("[callTextWithImage] Gemini Flash failed:", msg.slice(0, 200));
    }
  }

  console.error("[callTextWithImage] all providers failed:", errors.join(" | ").slice(0, 1000));
  throw new Error("The reading assistant could not read that picture just now. Please try again.");
}

/** The text only. Kept for the many callers that do not record the provider. */
export async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string,
  maxTokens: number = 4096,
  opts: { effort?: ClaudeEffort } = {}
): Promise<string> {
  return (await callText(apiKey, model, system, userMessage, maxTokens, opts)).text;
}

/**
 * Parse JSON from a model's response, stripping code fences if present.
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
 * Resolve the effective API key and model from a company's credentials and
 * settings. A stored retired id is mapped to the current model.
 */
export function resolveClaudeConfig(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): { apiKey: string; model: string } {
  const apiKey = (credentials.api_key as string) || process.env.ANTHROPIC_API_KEY;
  const model = currentClaudeModel(settings.model as string | undefined);
  if (!apiKey) {
    if (geminiKey()) return { apiKey: NO_ANTHROPIC_KEY, model };
    throw new Error("No AI provider is configured for this company. Ask AGENCY to set it up.");
  }
  return { apiKey, model };
}
