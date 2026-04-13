import { NextResponse } from "next/server";

/**
 * POST /api/generate/transcribe/voice
 *
 * Transcribes audio using Gemini (free) or OpenAI Whisper (fallback).
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || "audio/webm";
    const errors: string[] = [];

    // ── Try Gemini (free) ────────────────────────────────────
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.Gemini || "";

    if (geminiKey) {
      try {
        const base64Audio = audioBuffer.toString("base64");

        // Gemini prefers simpler MIME types
        const cleanMime = mimeType.split(";")[0] || "audio/webm";

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Transcribe this audio recording exactly. Return only the transcription text, nothing else." },
                  { inline_data: { mime_type: cleanMime, data: base64Audio } },
                ],
              }],
              generationConfig: { temperature: 0 },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text.trim()) {
            return NextResponse.json({ text: text.trim(), provider: "gemini", duration: 0 });
          }
          errors.push("Gemini returned empty transcription");
        } else {
          const errText = await res.text();
          errors.push(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        errors.push(`Gemini error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push("No Gemini API key found");
    }

    // ── Try OpenAI Whisper (fallback) ─────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY || "";

    if (openaiKey) {
      try {
        const whisperForm = new FormData();
        whisperForm.append("file", new Blob([audioBuffer], { type: "audio/webm" }), "audio.webm");
        whisperForm.append("model", "whisper-1");

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: whisperForm,
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({ text: data.text || "", provider: "openai", duration: data.duration || 0 });
        } else {
          const errText = await res.text();
          errors.push(`Whisper API ${res.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        errors.push(`Whisper error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push("No OpenAI API key found");
    }

    // ── Both failed — return all errors for diagnosis ─────────
    console.error("[voice] All providers failed:", errors);
    return NextResponse.json(
      { error: errors.join(" | ") },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Voice transcription error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
