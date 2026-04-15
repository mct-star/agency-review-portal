const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

interface AnthropicResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Shared LLM call utility with 4-tier fallback chain:
 *   1. Claude (Anthropic) — user's primary choice, needs credits
 *   2. Gemini 2.5 Pro — free, higher quality, but often 503-overloaded
 *   3. Gemini 2.5 Flash — free, separate quota from Pro, faster
 *   4. OpenAI GPT-4o — paid, last resort
 *
 * The chain continues to the next provider on ANY failure (401, 429, 503, 5xx, network).
 * This ensures content generation stays available even when individual providers are down.
 */

async function callGeminiModel(
  geminiKey: string,
  model: string,
  system: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${model} (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error(`Gemini ${model} returned empty response`);
  return text;
}

async function callOpenAIModel(
  openaiKey: string,
  system: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI returned empty response");
  return text;
}

export async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string,
  maxTokens: number = 4096
): Promise<string> {
  const errors: string[] = [];
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.Gemini || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Tier 1: Claude (skip if apiKey is the sentinel placeholder)
  if (apiKey && apiKey !== "no-anthropic-key-will-fallback-to-gemini") {
    try {
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
      if (!res.ok) throw new Error(`Anthropic (${res.status}): ${await res.text()}`);
      const data: AnthropicResponse = await res.json();
      const textBlock = data.content.find((c) => c.type === "text");
      if (!textBlock) throw new Error("No text content in Anthropic response");
      return textBlock.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Claude: ${msg}`);
      console.warn("[callClaude] Tier 1 (Claude) failed:", msg.slice(0, 200));
    }
  }

  // Tier 2: Gemini 2.5 Pro
  if (geminiKey) {
    try {
      const text = await callGeminiModel(geminiKey, "gemini-2.5-pro", system, userMessage, maxTokens);
      console.log("[callClaude] Tier 2 (Gemini 2.5 Pro) succeeded");
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Gemini Pro: ${msg}`);
      console.warn("[callClaude] Tier 2 (Gemini 2.5 Pro) failed:", msg.slice(0, 200));
    }

    // Tier 3: Gemini 2.5 Flash (separate quota from Pro, very fast)
    try {
      const text = await callGeminiModel(geminiKey, "gemini-2.5-flash", system, userMessage, maxTokens);
      console.log("[callClaude] Tier 3 (Gemini 2.5 Flash) succeeded");
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Gemini Flash: ${msg}`);
      console.warn("[callClaude] Tier 3 (Gemini 2.5 Flash) failed:", msg.slice(0, 200));
    }
  }

  // Tier 4: OpenAI GPT-4o
  if (openaiKey) {
    try {
      const text = await callOpenAIModel(openaiKey, system, userMessage, maxTokens);
      console.log("[callClaude] Tier 4 (OpenAI) succeeded");
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`OpenAI: ${msg}`);
      console.warn("[callClaude] Tier 4 (OpenAI) failed:", msg.slice(0, 200));
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join("\n")}`);
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
    // If no Anthropic key, use a placeholder — callClaude will fall back to Gemini
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.Gemini || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      return { apiKey: "no-anthropic-key-will-fallback-to-gemini", model: DEFAULT_MODEL };
    }
    throw new Error(
      "No AI provider available. Configure ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY."
    );
  }
  const model = (settings.model as string) || DEFAULT_MODEL;
  return { apiKey, model };
}
