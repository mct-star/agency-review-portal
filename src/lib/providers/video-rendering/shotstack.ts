/**
 * Shotstack Video Rendering Provider
 *
 * Uses the Shotstack Edit API to render videos from a timeline
 * specification. Converts our VideoRenderInput into Shotstack's
 * JSON timeline format, submits the render, and polls for completion.
 *
 * API docs: https://shotstack.io/docs/api/
 *
 * Requires credentials: { api_key: "..." }
 * Optional settings: { env: "stage" | "v1" }
 */

import type {
  VideoProvider,
  VideoRenderInput,
  VideoRenderOutput,
} from "../index";

const STAGE_URL = "https://api.shotstack.io/stage";
const PROD_URL = "https://api.shotstack.io/v1";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createShotstackVideoProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): VideoProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("Shotstack provider requires an api_key in credentials");
  }
  const env = (settings.env as string) || "stage";
  const baseUrl = env === "v1" ? PROD_URL : STAGE_URL;

  return {
    async render(input: VideoRenderInput): Promise<VideoRenderOutput> {
      // Build a simple Shotstack timeline from the script
      // This is a baseline implementation. For production, you'd build
      // a more sophisticated timeline with B-roll, transitions, etc.

      const duration = input.targetDuration || 180; // Default 3 minutes
      const resolution = input.aspectRatio === "9:16" ? "mobile" : "hd";

      const timeline = {
        timeline: {
          background: input.brandColor || "#000000",
          tracks: [
            // Title overlay track
            {
              clips: [
                {
                  asset: {
                    type: "html",
                    html: `<div style="font-family:Arial;color:#fff;font-size:48px;text-align:center;padding:20px;">${escapeHtml(input.title)}</div>`,
                    width: 1920,
                    height: 200,
                  },
                  start: 0,
                  length: 5,
                  position: "center",
                  transition: {
                    in: "fade",
                    out: "fade",
                  },
                },
              ],
            },
            // Speaker lower-third
            ...(input.speakerName
              ? [
                  {
                    clips: [
                      {
                        asset: {
                          type: "html",
                          html: `<div style="font-family:Arial;color:#fff;font-size:24px;background:rgba(0,0,0,0.7);padding:10px 20px;border-radius:4px;">${escapeHtml(input.speakerName)}</div>`,
                          width: 400,
                          height: 60,
                        },
                        start: 3,
                        length: 4,
                        position: "bottomLeft",
                        offset: { x: 0.05, y: 0.08 },
                        transition: { in: "slideLeft", out: "fade" },
                      },
                    ],
                  },
                ]
              : []),
            // Media clips (B-roll images/videos)
            ...(input.mediaUrls && input.mediaUrls.length > 0
              ? [
                  {
                    clips: input.mediaUrls.map((url, i) => ({
                      asset: {
                        type: url.match(/\.(mp4|mov|webm)$/i) ? "video" : "image",
                        src: url,
                      },
                      start: i * (duration / input.mediaUrls!.length),
                      length: duration / input.mediaUrls!.length,
                      fit: "cover",
                    })),
                  },
                ]
              : []),
          ],
        },
        output: {
          format: "mp4",
          resolution,
          aspectRatio: input.aspectRatio || "16:9",
        },
      };

      // Submit the render
      const renderRes = await fetch(`${baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(timeline),
      });

      if (!renderRes.ok) {
        const err = await renderRes.text();
        throw new Error(`Shotstack render submission failed (${renderRes.status}): ${err}`);
      }

      const renderData = await renderRes.json();
      const renderId = renderData.response?.id;

      if (!renderId) {
        throw new Error("No render ID returned from Shotstack");
      }

      // Poll for completion (max 5 minutes)
      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await sleep(5000);

        const statusRes = await fetch(`${baseUrl}/render/${renderId}`, {
          headers: { "x-api-key": apiKey },
        });

        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();
        const status = statusData.response?.status;

        if (status === "done") {
          return {
            videoUrl: statusData.response.url,
            thumbnailUrl: statusData.response.thumbnail || null,
            durationSeconds: duration,
            format: "mp4",
            resolution: resolution === "mobile" ? "1080x1920" : "1920x1080",
          };
        }

        if (status === "failed") {
          throw new Error(
            `Shotstack render failed: ${statusData.response.error || "Unknown error"}`
          );
        }

        // Still rendering, continue polling
      }

      throw new Error("Shotstack render timed out after 5 minutes");
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
