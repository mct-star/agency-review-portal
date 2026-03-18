/**
 * Runway ML Image Generation Provider
 *
 * Uses Runway's API for image generation (Gen-3 models).
 *
 * API docs: https://docs.dev.runwayml.com/
 *
 * Requires credentials: { api_key: "..." }
 * Optional settings: { model: "gen3a_turbo" }
 *
 * Note: Runway is primarily known for video generation.
 * For image-only tasks, other providers may be more cost-effective.
 */

import type {
  ImageProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../index";

const API_URL = "https://api.dev.runwayml.com/v1/image_to_image";
const TEXT_TO_IMAGE_URL = "https://api.dev.runwayml.com/v1/text_to_image";

export function createRunwayImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("Runway provider requires an api_key in credentials");
  }

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const res = await fetch(TEXT_TO_IMAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
        body: JSON.stringify({
          prompt: input.prompt,
          model: (settings.model as string) || "gen3a_turbo",
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Runway API error (${res.status}): ${err}`);
      }

      const data = await res.json();

      // Runway may return a task ID for async processing
      if (data.id && !data.output) {
        // Poll for completion
        const taskId = data.id;
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const statusRes = await fetch(
            `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "X-Runway-Version": "2024-11-06",
              },
            }
          );

          if (!statusRes.ok) continue;

          const statusData = await statusRes.json();
          if (statusData.status === "SUCCEEDED" && statusData.output) {
            const urls = Array.isArray(statusData.output) ? statusData.output : [statusData.output];
            return {
              images: urls.map((url: string, i: number) => ({
                url,
                filename: `runway-${Date.now()}-${i + 1}.png`,
              })),
            };
          }

          if (statusData.status === "FAILED") {
            throw new Error(`Runway task failed: ${statusData.failure || "Unknown error"}`);
          }
        }

        throw new Error("Runway task timed out after 60 seconds");
      }

      // Synchronous response
      const urls = Array.isArray(data.output) ? data.output : [data.output];
      return {
        images: urls.filter(Boolean).map((url: string, i: number) => ({
          url,
          filename: `runway-${Date.now()}-${i + 1}.png`,
        })),
      };
    },
  };
}
