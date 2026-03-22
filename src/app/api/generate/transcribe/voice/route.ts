import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/providers";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * POST /api/generate/transcribe/voice
 *
 * Accepts audio as FormData (field: "audio") and transcribes it using
 * OpenAI Whisper. Designed for the VoiceDictation UI component.
 *
 * Query params:
 *   - companyId (optional): look up the company's OpenAI API key
 *
 * Returns: { text: string, duration: number }
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");

    // Resolve the OpenAI API key
    let apiKey: string | undefined;

    if (companyId) {
      try {
        const resolved = await resolveProvider(companyId, "transcription");
        if (resolved?.credentials?.api_key) {
          apiKey = resolved.credentials.api_key as string;
        }
      } catch {
        // Fall through to env key
      }
    }

    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "No OpenAI API key configured. Set OPENAI_API_KEY or configure a transcription provider." },
        { status: 500 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided. Send a FormData with field name 'audio'." },
        { status: 400 }
      );
    }

    // Build the request to OpenAI Whisper
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, "recording.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "verbose_json");

    const res = await fetch(WHISPER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Whisper API error:", res.status, errText);
      return NextResponse.json(
        { error: `Transcription failed (${res.status}): ${errText}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    return NextResponse.json({
      text: data.text || "",
      duration: data.duration || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Voice transcription error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
