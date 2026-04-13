/**
 * Shared Transcription Utility
 *
 * Transcribes audio using Gemini (free, primary) or OpenAI Whisper (fallback).
 * Used by voice-to-post, voice dictation, and other transcription endpoints.
 */

export interface TranscriptionResult {
  text: string;
  provider: "gemini" | "openai";
  duration?: number;
}

/**
 * Transcribes audio using Gemini (free, primary) or OpenAI Whisper (fallback).
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = "audio/webm"
): Promise<TranscriptionResult> {
  // Try 1: Gemini (free)
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.Gemini;
  if (geminiKey) {
    try {
      const text = await transcribeWithGemini(geminiKey, audioBuffer, mimeType);
      if (text.trim()) return { text: text.trim(), provider: "gemini" };
    } catch (err) {
      console.error("[transcribe] Gemini failed, trying OpenAI:", err);
    }
  }

  // Try 2: OpenAI Whisper
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const result = await transcribeWithWhisper(openaiKey, audioBuffer);
      return { text: result.text.trim(), provider: "openai", duration: result.duration };
    } catch (err) {
      console.error("[transcribe] OpenAI Whisper failed:", err);
    }
  }

  throw new Error(
    "No transcription provider available. Configure GOOGLE_GEMINI_API_KEY or OPENAI_API_KEY."
  );
}

/**
 * Transcribe audio using Google Gemini's generateContent endpoint.
 * Gemini accepts audio as inline_data and can transcribe it as a multimodal task.
 * This is free-tier eligible.
 */
async function transcribeWithGemini(
  apiKey: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const base64Audio = audioBuffer.toString("base64");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Transcribe this audio recording exactly. Return only the transcription text, nothing else.",
              },
              {
                inline_data: { mime_type: mimeType, data: base64Audio },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini transcription failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Returns both text and duration from the verbose_json response.
 */
async function transcribeWithWhisper(
  apiKey: string,
  audioBuffer: Buffer
): Promise<{ text: string; duration: number }> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)], { type: "audio/webm" }),
    "audio.webm"
  );
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return { text: data.text || "", duration: data.duration || 0 };
}
