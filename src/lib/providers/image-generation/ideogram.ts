/**
 * Ideogram Image Generation Provider
 *
 * Uses Ideogram's API for image generation.
 * Particularly strong at text-in-image (quote cards, infographics).
 *
 * API docs: https://developer.ideogram.ai/
 *
 * Requires credentials: { api_key: "..." }
 * Optional settings: { model: "V_2", style: "DESIGN" }
 *
 * Cost: ~$0.04-0.08 per image
 */

import type {
  ImageProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../index";

const API_URL = "https://api.ideogram.ai/generate";

const ASPECT_RATIO_MAP: Record<string, string> = {
  "1:1": "ASPECT_1_1",
  "16:9": "ASPECT_16_9",
  "9:16": "ASPECT_9_16",
  "4:3": "ASPECT_4_3",
};

export function createIdeogramImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("Ideogram provider requires an api_key in credentials");
  }
  const model = (settings.model as string) || "V_2";
  const defaultStyle = (settings.style as string) || "AUTO";

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const aspectRatio = ASPECT_RATIO_MAP[input.aspectRatio || "1:1"] || "ASPECT_1_1";

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify({
          image_request: {
            prompt: input.prompt,
            model,
            aspect_ratio: aspectRatio,
            style_type: input.style || defaultStyle,
            magic_prompt_option: "AUTO",
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ideogram API error (${res.status}): ${err}`);
      }

      const data = await res.json();

      const images = (data.data || []).map(
        (img: { url: string; is_image_safe?: boolean }, i: number) => ({
          url: img.url,
          filename: `ideogram-${Date.now()}-${i + 1}.png`,
        })
      );

      return { images };
    },
  };
}
