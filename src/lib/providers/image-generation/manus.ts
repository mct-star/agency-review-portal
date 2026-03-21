/**
 * Manus Image Generation Provider
 *
 * Uses the Manus agent API to generate images asynchronously.
 * Manus is an autonomous agent platform — tasks are submitted via API,
 * the agent executes them (using its internal image generation tools),
 * and the results are polled until complete.
 *
 * Important: unlike DALL-E or fal.ai, this is NOT a direct image endpoint.
 * Typical generation time is 1–4 minutes. The provider blocks until done
 * (up to MAX_WAIT_MS), which is compatible with Vercel Pro's 300s limit.
 *
 * API docs: https://open.manus.im/docs
 * Auth: API_KEY header (not Authorization: Bearer)
 *
 * Credentials: { api_key: "sk-..." }
 * Settings: { agent_profile?: "manus-1.6" | "manus-1.6-lite" | "manus-1.6-max" }
 */

import type {
  ImageProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../index";

const MANUS_API_BASE = "https://api.manus.im";
const POLL_INTERVAL_MS = 5_000;     // Poll every 5 seconds
const MAX_WAIT_MS = 5 * 60 * 1_000; // 5 minute hard timeout

const ASPECT_NOTES: Record<string, string> = {
  "1:1": "square format (1:1 aspect ratio)",
  "16:9": "landscape widescreen format (16:9 aspect ratio)",
  "9:16": "portrait vertical format (9:16 aspect ratio — ideal for mobile/stories)",
  "4:3": "standard landscape format (4:3 aspect ratio)",
};

function buildImagePrompt(input: ImageGenerationInput): string {
  const aspectNote = ASPECT_NOTES[input.aspectRatio || "1:1"] ?? "square format";
  const styleNote = input.style ? ` Visual style: ${input.style}.` : "";

  return `Generate a single high-quality image:

${input.prompt}

Technical requirements:
- Format: ${aspectNote}
- Resolution: at least 1024px on the shortest edge${styleNote}
- No watermarks, text overlays, logos, or borders
- Output as a single PNG or JPEG file named "generated-image.png"

Provide the image as a downloadable file attachment in your response. Do not include any commentary — just generate and attach the image.`;
}

/**
 * Extract image URLs from a completed Manus task response.
 * Tries multiple possible output structures since the format
 * can vary depending on agent version and task type.
 */
function extractImageUrls(taskData: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const isImageFile = (name: string, type: string): boolean => {
    return (
      type.startsWith("image/") ||
      /\.(png|jpg|jpeg|webp|gif)$/i.test(name)
    );
  };

  const addFilesFromArray = (files: unknown[]) => {
    for (const f of files) {
      const file = f as Record<string, unknown>;
      const url = (file.url ?? file.download_url ?? file.link) as string | undefined;
      const name = String(file.name ?? file.filename ?? "");
      const type = String(file.type ?? file.mime_type ?? file.content_type ?? "");
      if (url && isImageFile(name, type)) urls.push(url);
    }
  };

  // Check output.files (most common format)
  const output = taskData.output as Record<string, unknown> | undefined;
  if (Array.isArray(output?.files)) addFilesFromArray(output!.files);

  // Check result.files (alternative structure)
  const result = taskData.result as Record<string, unknown> | undefined;
  if (Array.isArray(result?.files)) addFilesFromArray(result!.files);

  // Check top-level files array
  if (Array.isArray(taskData.files)) addFilesFromArray(taskData.files as unknown[]);

  // Fallback: scan output text for image URLs
  const text = String(
    output?.text ?? result?.text ?? taskData.message ?? ""
  );
  const urlPattern = /https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp)/gi;
  const textMatches = text.match(urlPattern) ?? [];
  urls.push(...textMatches);

  return [...new Set(urls)];
}

async function submitTask(apiKey: string, prompt: string, profile: string): Promise<string> {
  const res = await fetch(`${MANUS_API_BASE}/v1/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API_KEY": apiKey,
    },
    body: JSON.stringify({
      prompt,
      task_mode: "agent",
      agent_profile: profile,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Manus task submission failed (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const taskId = data.id as string | undefined;
  if (!taskId) {
    throw new Error(`Manus did not return a task ID. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return taskId;
}

async function pollTask(
  apiKey: string,
  taskId: string
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${MANUS_API_BASE}/v1/tasks/${taskId}`, {
      headers: { "API_KEY": apiKey },
    });

    if (!res.ok) continue; // Transient error — retry on next poll

    const data = await res.json() as Record<string, unknown>;
    const status = data.status as string | undefined;

    if (status === "stopped") return data;

    if (status === "failed" || status === "error") {
      const msg = String(data.error ?? data.message ?? "Unknown error");
      throw new Error(`Manus task ${taskId} failed: ${msg}`);
    }

    // status: "queued" | "running" — keep polling
  }

  throw new Error(
    `Manus image generation timed out after ${MAX_WAIT_MS / 60_000} minutes. ` +
    `Task ID: ${taskId}. Check https://manus.im for task status.`
  );
}

export function createManusImageProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): ImageProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("Manus image provider requires an api_key in credentials");
  }

  const profile = (settings.agent_profile as string) ?? "manus-1.6";

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const prompt = buildImagePrompt(input);

      // Submit to Manus agent
      const taskId = await submitTask(apiKey, prompt, profile);

      // Poll until the agent finishes (typically 1–4 minutes)
      const taskData = await pollTask(apiKey, taskId);

      // Extract image URLs from task output
      const imageUrls = extractImageUrls(taskData);

      if (imageUrls.length === 0) {
        throw new Error(
          `Manus task ${taskId} completed but no image files were found in the output. ` +
          `Raw output: ${JSON.stringify(taskData).slice(0, 600)}`
        );
      }

      return {
        images: imageUrls.map((url, i) => ({
          url,
          filename: `manus-${Date.now()}-${i + 1}.png`,
        })),
      };
    },
  };
}
