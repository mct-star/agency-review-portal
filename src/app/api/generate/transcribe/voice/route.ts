import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/supabase/admin";
import { transcribeAudio } from "@/lib/providers/transcription/transcribe";
import { canAccessCompany } from "@/lib/auth/permissions";

export const maxDuration = 120;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav"]);

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

  const selectedCompanyId = new URL(request.url).searchParams.get("companyId");
  if (selectedCompanyId === "") return NextResponse.json({ error: "Choose a company before dictating." }, { status: 400 });
  const companyId = selectedCompanyId ?? profile.company_id ?? undefined;
  if (companyId && !canAccessCompany(profile, companyId)) {
    return NextResponse.json({ error: "You cannot dictate for that company." }, { status: 403 });
  }

  const tooLarge = () => NextResponse.json({ error: "That recording is too large. Keep it under 4 MB or type instead." }, { status: 413 });
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) return tooLarge();

  try {
    // Enforce the limit while reading, even without a Content-Length header.
    if (!request.body) return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let uploadTimedOut = false;
    const uploadTimeout = setTimeout(() => {
      uploadTimedOut = true;
      void reader.cancel();
    }, 15_000);
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_REQUEST_BYTES) {
          await reader.cancel();
          return tooLarge();
        }
        chunks.push(chunk.value);
      }
    } finally {
      clearTimeout(uploadTimeout);
      reader.releaseLock();
    }
    if (uploadTimedOut) {
      return NextResponse.json({ error: "The recording upload took too long. Please try again or type instead." }, { status: 408 });
    }
    const formData = await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.concat(chunks),
    }).formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }

    if (audioFile.size > MAX_AUDIO_BYTES) return tooLarge();
    if (audioFile.size === 0) return NextResponse.json({ error: "No audio recorded. Please try again or type instead." }, { status: 400 });

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = (audioFile.type || "audio/webm").split(";")[0] || "audio/webm";
    if (!AUDIO_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "That audio format is not supported. You can type instead." }, { status: 415 });
    }
    const result = await transcribeAudio(audioBuffer, mimeType, companyId);
    return NextResponse.json({ text: result.text, provider: result.provider, duration: result.duration ?? 0 });
  } catch (err) {
    console.error("[voice] transcription failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "We could not transcribe that just now. You can type instead." },
      { status: 502 }
    );
  }
}
