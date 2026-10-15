import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/supabase/admin";
import { transcribeAudio } from "@/lib/providers/transcription/transcribe";

/**
 * POST /api/generate/transcribe/voice
 *
 * Transcribes a short dictation for the signed-in user (VoiceDictation).
 * Runs on the platform's keys, so it needs a signed-in person: before
 * 14 Oct 2026 anyone could call it. Goes through the shared transcription
 * lib (Gemini Flash, then Whisper) and never returns vendor error text.
 */
export async function POST(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = (audioFile.type || "audio/webm").split(";")[0] || "audio/webm";
    const result = await transcribeAudio(audioBuffer, mimeType, profile.company_id ?? undefined);
    return NextResponse.json({ text: result.text, provider: result.provider, duration: result.duration ?? 0 });
  } catch (err) {
    console.error("[voice] transcription failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "We could not transcribe that just now. You can type instead." },
      { status: 502 }
    );
  }
}
