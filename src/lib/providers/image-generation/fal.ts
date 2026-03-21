/**
 * fal.ai Image Generation Provider
 *
 * Uses fal.ai's serverless API for image generation.
 * Supports Flux models (flux-pro/v1.1, flux/dev, flux/schnell, etc.)
 *
 * API docs: https://fal.ai/docs
 *
 * Requires credentials: { api_key: "..." }
 * Optional settings: { model: "fal-ai/flux-pro/v1.1" }
 *
 * Model costs (approximate):
 *   flux-pro/v1.1       ~$0.04/image  ← default, best quality
 *   flux-pro/v1.1-ultra ~$0.06/image  ← highest quality, slower
 *   flux/dev            ~$0.025/image ← good balance
 *   flux/schnell        ~$0.003/image ← fast/cheap, lower quality
 */

import type {
  ImageProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../index";

const FAL_API_URL = "https://fal.run";

const ASPECT_RATIO_MAP: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "4:3": { width: 1152, height: 896 },
};

export function createFalImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("fal.ai provider requires an api_key in credentials");
  }
  // Default to flux-pro/v1.1 — best quality for Pixar-style illustration work
  // Use "fal-ai/flux/schnell" in settings.model if you need fast/cheap previews
  const model = (settings.model as string) || "fal-ai/flux-pro/v1.1";

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const dims = ASPECT_RATIO_MAP[input.aspectRatio || "1:1"] || ASPECT_RATIO_MAP["1:1"];
      const numImages = Math.min(input.count || 1, 4);

      const res = await fetch(`${FAL_API_URL}/${model}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          image_size: {
            width: dims.width,
            height: dims.height,
          },
          num_images: numImages,
          // Schnell needs explicit low step count; Pro models use their own defaults
          ...(model.includes("schnell") ? { num_inference_steps: 4 } : {}),
          enable_safety_checker: false,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`fal.ai API error (${res.status}): ${err}`);
      }

      const data = await res.json();

      const images = (data.images || []).map(
        (img: { url: string; content_type?: string }, i: number) => ({
          url: img.url,
          filename: `fal-${Date.now()}-${i + 1}.png`,
        })
      );

      return { images };
    },
  };
}
