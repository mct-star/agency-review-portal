/**
 * OpenAI Image Generation Provider
 *
 * Supports DALL-E 3 (URL response) and gpt-image-1 (base64 response).
 * Defaults to dall-e-3 which is widely available and returns direct URLs.
 *
 * IMPORTANT: DALL-E 3 URLs are temporary (expire in ~1 hour).
 * The images route is responsible for re-uploading to permanent storage.
 */

import type {
  ImageProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../index";

const API_URL = "https://api.openai.com/v1/images/generations";

const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1024x1024", // Closest supported
};

// Only these values are valid for DALL-E 3's style parameter
const VALID_DALLE3_STYLES = new Set(["vivid", "natural"]);

export function createOpenAIImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("OpenAI image provider requires an api_key in credentials");
  }

  // Default to dall-e-3: widely available, returns URLs, proven quality.
  // gpt-image-1 requires special API access and returns b64_json by default.
  const model = (settings.model as string) || "dall-e-3";
  const isGptImage1 = model === "gpt-image-1";

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const size = ASPECT_RATIO_TO_SIZE[input.aspectRatio || "1:1"] || "1024x1024";
      // DALL-E 3 only supports n=1; gpt-image-1 supports up to 10
      const n = isGptImage1 ? Math.min(input.count || 1, 4) : 1;

      // Build request body — style is only valid for dall-e-3 and must be "vivid"|"natural"
      const requestBody: Record<string, unknown> = {
        model,
        prompt: input.prompt,
        n,
        size,
        response_format: isGptImage1 ? "b64_json" : "url",
      };

      // Only send style for dall-e-3 and only if it's a valid value
      if (!isGptImage1 && input.style && VALID_DALLE3_STYLES.has(input.style)) {
        requestBody.style = input.style;
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI Image API error (${res.status}): ${err.slice(0, 500)}`);
      }

      const data = await res.json();

      const images = (data.data || []).map(
        (img: { url?: string; b64_json?: string }, i: number) => {
          // gpt-image-1 returns b64_json; dal-e-3 returns url
          const url = img.url
            || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : "");
          return {
            url,
            filename: `openai-${Date.now()}-${i + 1}.png`,
          };
        }
      );

      return { images };
    },
  };
}
