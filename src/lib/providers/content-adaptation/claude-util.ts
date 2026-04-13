const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

interface AnthropicResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Shared LLM call utility with automatic Gemini fallback.
 * Tries Claude first, falls back to Gemini if Claude fails (e.g. no credits).
 */
export async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string,
  maxTokens: number = 4096
): Promise<string> {
  // Try Claude first
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

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
    }

    const data: AnthropicResponse = await res.json();
    const textBlock = data.content.find((c) => c.type === "text");
    if (!textBlock) throw new Error("No text content in Anthropic response");
    return textBlock.text;
  } catch (claudeErr) {
    // Fall back to Gemini
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.Gemini || process.env.GEMINI_API_KEY;
    if (!geminiKey) throw claudeErr;

    console.warn("[callClaude] Claude failed, falling back to Gemini:", claudeErr instanceof Error ? claudeErr.message : claudeErr);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
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

    if (!geminiRes.ok) {
      throw new Error(`Both Claude and Gemini failed. Gemini error (${geminiRes.status}): ${await geminiRes.text()}`);
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Gemini returned empty response");
    console.log("[callClaude] Successfully fell back to Gemini");
    return text;
  }
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
