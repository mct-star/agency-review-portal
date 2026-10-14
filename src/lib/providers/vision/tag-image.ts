import {
  autoTagPrompt,
  autoTagResponseSchema,
  parseAutoTagJson,
  type ParsedTags,
} from "@/lib/media/vocabulary";

/**
 * One vision call per photo (or per video, with its frames), returning
 * strict JSON in the fixed vocabulary.
 *
 * Provider chain, cheapest first: Gemini Flash, then Claude Haiku. A
 * provider is skipped when its key is not set, and the next one is tried
 * when a call fails OR when its reply is not valid JSON in the agreed
 * shape. If both fail the error is thrown and the caller records it so
 * the photo can be retried; nothing is half-saved.
 */

export interface VisionImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

const GEMINI_MODEL = "gemini-2.5-flash";
const CLAUDE_MODEL = "claude-3-5-haiku-20241022";

type Fetcher = typeof fetch;

export function geminiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GOOGLE_GEMINI_API_KEY || env.Gemini || env.GEMINI_API_KEY || env.GEMINI;
}

export function anthropicKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ANTHROPIC_API_KEY || env.Anthropic;
}

async function callGemini(key: string, images: VisionImage[], prompt: string, f: Fetcher): Promise<string> {
  const res = await f(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })),
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
          responseSchema: autoTagResponseSchema(),
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

async function callClaude(key: string, images: VisionImage[], prompt: string, f: Fetcher): Promise<string> {
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((i) => ({
              type: "image",
              source: { type: "base64", media_type: i.mimeType, data: i.base64 },
            })),
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content?.find((c: { type: string }) => c.type === "text")?.text;
  if (!text) throw new Error("Claude returned no text");
  return text;
}

export async function tagImages(
  images: VisionImage[],
  options: { venueContext?: string | null; fetcher?: Fetcher; env?: NodeJS.ProcessEnv } = {}
): Promise<ParsedTags & { provider: "gemini" | "claude" }> {
  if (images.length === 0) throw new Error("No image to tag");
  const f = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  const prompt = autoTagPrompt(options.venueContext ?? null);
  const errors: string[] = [];

  const gKey = geminiKey(env);
  if (gKey) {
    try {
      return { ...parseAutoTagJson(await callGemini(gKey, images, prompt, f)), provider: "gemini" };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  const cKey = anthropicKey(env);
  if (cKey) {
    try {
      return { ...parseAutoTagJson(await callClaude(cKey, images, prompt, f)), provider: "claude" };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(errors.length ? `Tagging failed: ${errors.join(" | ")}` : "No vision provider is configured");
}
