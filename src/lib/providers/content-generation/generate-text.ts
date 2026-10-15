/**
 * Unified text generation: Claude first, Gemini 2.5 Flash second.
 *
 * Decided 14 Oct 2026. Gemini Pro has a quota of zero on the production key
 * and the OpenAI key is invalid, so neither is in the chain. Each provider is
 * called via its native REST API with no SDK dependencies.
 *
 * Usage:
 *   import { generateText } from "@/lib/providers/content-generation/generate-text";
 *   const { text, provider, model } = await generateText({ systemPrompt, userPrompt });
 */

// ── Types ─────────────────────────────────────────────────────

export interface GenerateTextOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  companyId?: string; // Reserved for future company-level API key lookup
  /**
   * Kept for callers that still pass it. Every Gemini call now uses
   * gemini-2.5-flash: gemini-2.5-pro has a quota of zero on the production
   * key (live check, 14 Oct 2026) and is no longer in the chain.
   */
  geminiModel?: "gemini-2.5-pro" | "gemini-2.5-flash";
  /**
   * A JSON schema for the reply. When set, the Claude call uses the API's
   * structured output (output_config.format) so the text block is the JSON
   * object and nothing else. Gemini and OpenAI are unchanged and still rely
   * on the prompt. Live check, 14 Oct 2026: free-text JSON from Claude
   * failed to parse about one call in eight.
   */
  jsonSchema?: Record<string, unknown>;
  /** Claude effort. Defaults to low; the caption writer uses medium. */
  effort?: "low" | "medium" | "high";
}

const GEMINI_MODEL = "gemini-2.5-flash";
// claude-sonnet-4-20250514 was retired and returned 404 (live check, 14 Oct 2026).
const CLAUDE_MODEL = "claude-sonnet-5-5";

export interface GenerateTextResult {
  text: string;
  provider: "claude" | "gemini";
  model: string;
}

// ── Provider callers ──────────────────────────────────────────

async function callClaude(
  apiKey: string,
  opts: GenerateTextOptions
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens || 2000,
      // No temperature: the Claude 5.5 models reject it ("deprecated for
      // this model", 400) and the whole Claude tier failed on it (14 Oct 2026).
      // Thinking off: Sonnet 5.5 thinks by default and those tokens count
      // against max_tokens, so a 700-token caption came back as a thinking
      // block and no text. between_tools is the only way to switch it off
      // on this model, and needs effort at high or below.
      thinking: { type: "between_tools" },
      output_config: {
        effort: opts.effort ?? "low",
        ...(opts.jsonSchema ? { format: { type: "json_schema", schema: opts.jsonSchema } } : {}),
      },
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // The reply is a list of blocks and a thinking block may come first, so
  // read the first text block rather than content[0].
  const blocks: Array<{ type: string; text?: string }> = data.content || [];
  return blocks.find((b) => b.type === "text")?.text || "";
}

async function callGemini(
  apiKey: string,
  opts: GenerateTextOptions
): Promise<string> {
  const model = GEMINI_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.systemPrompt }] },
        contents: [{ parts: [{ text: opts.userPrompt }] }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens || 2000,
          temperature: opts.temperature ?? 0.7,
          // Flash "thinks" before it answers and those tokens count against
          // maxOutputTokens: a 700-token caption request spent 630 on thought
          // and returned truncated JSON (live check, 14 Oct 2026). Off.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── Main entry point ──────────────────────────────────────────

/**
 * Generate text: Claude first, Gemini Flash second. Throws if both fail or
 * neither key is set. The result names the provider and model that answered.
 */
export async function generateText(
  options: GenerateTextOptions
): Promise<GenerateTextResult> {
  const errors: string[] = [];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const result = await callClaude(anthropicKey, options);
      return { text: result, provider: "claude", model: CLAUDE_MODEL };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      console.error("[generateText] Claude failed, trying Gemini Flash:", err);
    }
  }

  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const result = await callGemini(geminiKey, options);
      return { text: result, provider: "gemini", model: GEMINI_MODEL };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      console.error("[generateText] Gemini Flash failed:", err);
    }
  }

  if (!anthropicKey && !geminiKey) {
    throw new Error("No AI provider available. Configure ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY.");
  }
  throw new Error(`All LLM providers failed:\n${errors.join("\n")}`);
}
