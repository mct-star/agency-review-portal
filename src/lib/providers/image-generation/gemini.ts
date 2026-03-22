/**
 * Google Gemini Imagen Provider
 *
 * Uses Google's Imagen 3 model via the Gemini API for photorealistic
 * and editorial-style image generation. Excellent for:
 * - Healthcare setting photography
 * - Editorial/lifestyle images
 * - Product photography scenes
 * - Professional headshot-style compositions
 *
 * Effectively free for users with Google Workspace subscriptions
 * (generous quota included), making it ideal for high-volume image
 * types that don't need Pixar 3D or face-matching.
 *
 * API: Gemini API with Imagen 3 model
 * Docs: https://ai.google.dev/gemini-api/docs/imagen
 *
 * Requires: GOOGLE_GEMINI_API_KEY env var or credentials.api_key
 */

import type {
  ImageProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../index";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const ASPECT_RATIO_MAP: Record<string, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
};

export function createGeminiImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey =
    (credentials.api_key as string) ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    "";

  if (!apiKey) {
    throw new Error(
      "Gemini provider requires an api_key in credentials or GOOGLE_GEMINI_API_KEY env var"
    );
  }

  const model = (settings.model as string) || "imagen-3.0-generate-002";

  return {
    async generate(
      input: ImageGenerationInput
    ): Promise<ImageGenerationOutput> {
      const numImages = Math.min(input.count || 1, 4);
      const aspectRatio =
        ASPECT_RATIO_MAP[input.aspectRatio || "1:1"] || "1:1";

      // Imagen 3 uses the generateImages endpoint
      const url = `${GEMINI_API_BASE}/models/${model}:predict?key=${apiKey}`;

      // Build the request body for Imagen 3
      const requestBody = {
        instances: [
          {
            prompt: input.prompt,
          },
        ],
        parameters: {
          sampleCount: numImages,
          aspectRatio,
          // Safety settings - allow healthcare content but block harmful
          safetySetting: "BLOCK_MEDIUM_AND_ABOVE",
          // Request high quality
          personGeneration: "ALLOW_ADULT",
        },
      };

      // Try the Imagen 3 predict endpoint first
      let res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      // If predict endpoint doesn't work, fall back to generateContent with image generation
      if (!res.ok) {
        const fallbackUrl = `${GEMINI_API_BASE}/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
        const fallbackBody = {
          contents: [
            {
              parts: [
                {
                  text: `Generate a high-quality, photorealistic image based on this description: ${input.prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        };

        res = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallbackBody),
        });
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Gemini image generation failed (${res.status}): ${errText}`
        );
      }

      const data = await res.json();
      const images: { url: string; filename: string }[] = [];

      // Handle Imagen 3 predict response format
      if (data.predictions) {
        for (let i = 0; i < data.predictions.length; i++) {
          const prediction = data.predictions[i];
          if (prediction.bytesBase64Encoded) {
            // Convert base64 to data URI
            const mimeType = prediction.mimeType || "image/png";
            const dataUri = `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
            images.push({
              url: dataUri,
              filename: `gemini-imagen-${Date.now()}-${i}.png`,
            });
          }
        }
      }

      // Handle Gemini generateContent response format (fallback)
      if (images.length === 0 && data.candidates) {
        for (const candidate of data.candidates) {
          if (candidate.content?.parts) {
            for (let i = 0; i < candidate.content.parts.length; i++) {
              const part = candidate.content.parts[i];
              if (part.inlineData) {
                const mimeType = part.inlineData.mimeType || "image/png";
                const dataUri = `data:${mimeType};base64,${part.inlineData.data}`;
                images.push({
                  url: dataUri,
                  filename: `gemini-${Date.now()}-${i}.png`,
                });
              }
            }
          }
        }
      }

      if (images.length === 0) {
        throw new Error(
          "Gemini returned no images. The prompt may have been blocked by safety filters."
        );
      }

      return { images };
    },
  };
}
