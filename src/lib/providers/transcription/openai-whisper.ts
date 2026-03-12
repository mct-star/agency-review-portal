/**
 * OpenAI Whisper Transcription Provider
 *
 * Uses the OpenAI Audio Transcription API (Whisper model)
 * to transcribe audio and video files to text with timestamps.
 *
 * API docs: https://platform.openai.com/docs/api-reference/audio
 *
 * Requires credentials: { api_key: "..." }
 * Optional settings: { model: "whisper-1" }
 */

import type {
  TranscriptionProvider,
  TranscriptionInput,
  TranscriptionOutput,
} from "../index";

const API_URL = "https://api.openai.com/v1/audio/transcriptions";

export function createWhisperTranscriptionProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): TranscriptionProvider {
  const apiKey = credentials.api_key as string;
  if (!apiKey) {
    throw new Error("OpenAI Whisper provider requires an api_key in credentials");
  }
  const model = (settings.model as string) || "whisper-1";

  return {
    async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
      // First, download the media file
      const mediaRes = await fetch(input.mediaUrl);
      if (!mediaRes.ok) {
        throw new Error(
          `Failed to download media from ${input.mediaUrl}: ${mediaRes.status}`
        );
      }

      const mediaBlob = await mediaRes.blob();

      // Determine filename from URL or use a default
      const urlPath = new URL(input.mediaUrl).pathname;
      const ext = urlPath.split(".").pop() || "mp3";
      const filename = `audio.${ext}`;

      // Build multipart form data
      const formData = new FormData();
      formData.append("file", mediaBlob, filename);
      formData.append("model", model);
      formData.append("response_format", "verbose_json");

      if (input.language) {
        formData.append("language", input.language);
      }

      if (input.includeTimestamps) {
        formData.append("timestamp_granularities[]", "segment");
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI Whisper API error (${res.status}): ${err}`);
      }

      const data = await res.json();

      // Parse the verbose JSON response
      const segments = (data.segments || []).map(
        (seg: { start: number; end: number; text: string }) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        })
      );

      return {
        text: data.text || "",
        segments,
        language: data.language || input.language || "en",
        durationSeconds: data.duration || 0,
      };
    },
  };
}
