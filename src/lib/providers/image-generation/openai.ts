/**
 * OpenAI Image Generation Provider
 *
 * Uses OpenAI's image generation API (GPT Image / DALL-E)
 * to produce images from text prompts.
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

export function createOpenAIImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("OpenAI image provider requires an api_key in credentials");
  }
  const model = (settings.model as string) || "gpt-image-1";

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const size = ASPECT_RATIO_TO_SIZE[input.aspectRatio || "1:1"] || "1024x1024";
      const n = Math.min(input.count || 1, 4);

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt: input.prompt,
          n,
          size,
          ...(input.style ? { style: input.style } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI Image API error (${res.status}): ${err}`);
      }

      const data = await res.json();

      const images = (data.data || []).map(
        (img: { url?: string; b64_json?: string }, i: number) => ({
          url: img.url || `data:image/png;base64,${img.b64_json}`,
          filename: `generated-${Date.now()}-${i + 1}.png`,
        })
      );

      return { images };
    },
  };
}
