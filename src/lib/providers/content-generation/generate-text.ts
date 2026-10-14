/**
 * Unified Text Generation with Three-Tier LLM Fallback
 *
 * Tries providers in order: Claude (primary) → Gemini (fallback 1) → OpenAI (fallback 2).
 * Each provider is called via its native REST API — no SDK dependencies.
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
   * Which Gemini model to use when Gemini is the provider. Defaults to
   * gemini-2.5-pro. Short-form writers (the hospitality captions, the
   * weekly planner) pass gemini-2.5-flash: it is enough for a caption,
   * far cheaper, and it is the model available on a free-tier key,
   * where gemini-2.5-pro has a quota of zero (live check, 14 Oct 2026).
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
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";
// claude-sonnet-4-20250514 was retired and returned 404 (live check, 14 Oct 2026).
const CLAUDE_MODEL = "claude-sonnet-5-5";

export interface GenerateTextResult {
  text: string;
  provider: "claude" | "gemini" | "openai";
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
        effort: "low",
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
  const model = opts.geminiModel ?? DEFAULT_GEMINI_MODEL;
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
          // gemini-2.5-flash "thinks" before it answers and those tokens
          // count against maxOutputTokens: a 700-token caption request
          // spent 630 on thought and returned truncated JSON (live check,
          // 14 Oct 2026). Short-form writers do not need it, so it is
          // switched off for flash. gemini-2.5-pro cannot disable it.
          ...(model === "gemini-2.5-flash" ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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

async function callOpenAI(
  apiKey: string,
  opts: GenerateTextOptions
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temperature ?? 0.7,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Main entry point ──────────────────────────────────────────

/**
 * Generate text using the three-tier fallback chain:
 *   1. Claude (Anthropic) — primary
 *   2. Gemini (Google) — fallback 1 (free tier available)
 *   3. OpenAI — fallback 2
 *
 * Throws if all providers fail or none are configured.
 */
export async function generateText(
  options: GenerateTextOptions
): Promise<GenerateTextResult> {
  // Try 1: Gemini (Google) — free, primary provider
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.Gemini || process.env.GEMINI_API_KEY || process.env.GEMINI;
  if (geminiKey) {
    try {
      const result = await callGemini(geminiKey, options);
      return {
        text: result,
        provider: "gemini",
        model: options.geminiModel ?? DEFAULT_GEMINI_MODEL,
      };
    } catch (err) {
      console.error("[generateText] Gemini failed, trying Claude:", err);
    }
  }

  // Try 2: Claude (Anthropic) — fallback
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const result = await callClaude(anthropicKey, options);
      return {
        text: result,
        provider: "claude",
        model: CLAUDE_MODEL,
      };
    } catch (err) {
      console.error("[generateText] Claude failed, trying OpenAI:", err);
    }
  }

  // Try 3: OpenAI — last resort
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const result = await callOpenAI(openaiKey, options);
      return {
        text: result,
        provider: "openai",
        model: "gpt-4o",
      };
    } catch (err) {
      console.error("[generateText] OpenAI failed:", err);
    }
  }

  throw new Error(
    "No AI provider available. Configure GOOGLE_GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY."
  );
}
