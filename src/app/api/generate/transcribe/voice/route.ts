import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/providers/transcription/transcribe";

/**
 * POST /api/generate/transcribe/voice
 *
 * Accepts audio as FormData (field: "audio") and transcribes it.
 * Uses Gemini (free, primary) with OpenAI Whisper as fallback.
 * Designed for the VoiceDictation UI component.
 *
 * Query params:
 *   - companyId (optional): reserved for future per-company key lookup
 *
 * Returns: { text: string, duration: number, provider: string }
 */
export async function POST(request: Request) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided. Send a FormData with field name 'audio'." },
        { status: 400 }
      );
    }

    // Convert Blob to Buffer for the shared transcription utility
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/webm";

    // Get companyId from query params for API key lookup
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") || undefined;

    const result = await transcribeAudio(audioBuffer, mimeType, companyId);

    return NextResponse.json({
      text: result.text,
      duration: result.duration || 0,
      provider: result.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Voice transcription error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
