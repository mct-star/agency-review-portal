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
}

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
      model: "claude-sonnet-4-20250514",
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temperature ?? 0.7,
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callGemini(
  apiKey: string,
  opts: GenerateTextOptions
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.systemPrompt }] },
        contents: [{ parts: [{ text: opts.userPrompt }] }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens || 2000,
          temperature: opts.temperature ?? 0.7,
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
        model: "gemini-2.5-pro",
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
        model: "claude-sonnet-4-20250514",
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
