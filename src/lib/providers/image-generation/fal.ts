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

  // fal-ai/flux/pulid provides face-consistent generation from reference photos.
  // We switch to it automatically when reference images are provided.
  const pulidModel = "fal-ai/flux-pulid";

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const dims = ASPECT_RATIO_MAP[input.aspectRatio || "1:1"] || ASPECT_RATIO_MAP["1:1"];
      const numImages = Math.min(input.count || 1, 4);
      const hasReferenceImages = input.referenceImageUrls && input.referenceImageUrls.length > 0;

      // If reference images are provided, use PuLID for face-consistent generation
      if (hasReferenceImages) {
        const referenceUrl = input.referenceImageUrls![0]; // PuLID takes one reference face
        const pulidRes = await fetch(`${FAL_API_URL}/${pulidModel}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${apiKey}`,
          },
          body: JSON.stringify({
            prompt: input.prompt,
            reference_images: [{ image_url: referenceUrl }],
            image_size: {
              width: dims.width,
              height: dims.height,
            },
            num_images: numImages,
          }),
        });

        if (pulidRes.ok) {
          const pulidData = await pulidRes.json();
          const pulidImages = (pulidData.images || []).map(
            (img: { url: string }, i: number) => ({
              url: img.url,
              filename: `fal-pulid-${Date.now()}-${i + 1}.png`,
            })
          );
          if (pulidImages.length > 0) return { images: pulidImages };
        }
        // If PuLID fails, fall through to standard generation
        console.warn("[fal] PuLID face-consistent generation failed, falling back to standard model");
      }

      // Standard generation (no reference images, or PuLID fallback)
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
          // Schnell-only parameters — Pro models use their own defaults and
          // reject unknown parameters like enable_safety_checker with a 400.
          ...(model.includes("schnell") ? { num_inference_steps: 4, enable_safety_checker: false } : {}),
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
