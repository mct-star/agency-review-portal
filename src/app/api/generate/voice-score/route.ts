import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/generate/voice-score
 *
 * Lightweight voice-match scoring. Accepts a generated post and the
 * company ID, fetches the voice profile, and asks Claude Haiku to
 * score how well the post matches the author's voice.
 *
 * Body: { companyId: string, postText: string }
 * Returns: { score: number, feedback: string[] }
 */

const MODEL_HAIKU = "claude-3-5-haiku-20241022";
const API_URL = "https://api.anthropic.com/v1/messages";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId, postText } = body;

    if (!companyId || !postText) {
      return NextResponse.json(
        { error: "companyId and postText are required" },
        { status: 400 }
      );
    }

    // Auth check
    const user = await requireCompanyUser(companyId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Fetch voice profile
    const supabase = await createAdminSupabaseClient();
    const { data: voiceProfile } = await supabase
      .from("company_voice_profiles")
      .select("*")
      .eq("company_id", companyId)
      .is("spokesperson_id", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!voiceProfile) {
      return NextResponse.json(
        { score: 0, feedback: ["No voice profile configured for this company. Set one up in Settings to enable voice scoring."] },
        { status: 200 }
      );
    }

    // Extract key voice fields
    const structured = voiceProfile.structured_voice || {};
    const voiceThreeWords = structured.voice_three_words?.join(", ") || "not set";
    const voiceCharacter = structured.voice_character || "not set";
    const toneSpectrum = structured.tone_spectrum || {};
    const formalityLevel = toneSpectrum.formal_to_casual ?? 3;
    const energyLevel = toneSpectrum.reserved_to_enthusiastic ?? 3;
    const toneWords = voiceThreeWords;
    const bannedWords = (structured.banned_words || [])
      .flatMap((cat: { words: string[] }) => cat.words)
      .slice(0, 20)
      .join(", ") || "none specified";
    const writingSamples = (structured.writing_samples || [])
      .slice(0, 2)
      .map((s: { text: string }) => s.text)
      .join("\n---\n") || "none provided";
    const hedgingPref = structured.hedging_preference || "balanced";
    const signatureDevices = structured.signature_devices || {};

    const prompt = `You are evaluating whether this LinkedIn post matches the author's voice profile.

Voice profile:
- Voice in three words: ${toneWords}
- Voice character: ${voiceCharacter}
- Formality (1=very formal, 5=very casual): ${formalityLevel}
- Energy (1=very reserved, 5=very enthusiastic): ${energyLevel}
- Hedging preference: ${hedgingPref}
- Signature devices: ${JSON.stringify(signatureDevices)}
- Never-use words: ${bannedWords}
- Writing samples:
${writingSamples}

Post to evaluate:
${postText}

Score the voice match from 0-100 and provide exactly 2 bullet points of feedback.
Return ONLY valid JSON with no other text: { "score": 85, "feedback": ["First feedback point", "Second feedback point"] }`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[voice-score] Anthropic API error:", errText);
      return NextResponse.json(
        { error: "Voice scoring failed" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "";

    // Parse the JSON from the response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[voice-score] Could not parse JSON from:", rawText);
      return NextResponse.json(
        { score: 50, feedback: ["Voice scoring returned an unparseable result. Try again."] },
        { status: 200 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 50));
    const feedback = Array.isArray(parsed.feedback)
      ? parsed.feedback.slice(0, 2)
      : ["No feedback available"];

    return NextResponse.json({ score, feedback });
  } catch (err) {
    console.error("[voice-score] Error:", err);
    return NextResponse.json(
      { error: "Voice scoring failed" },
      { status: 500 }
    );
  }
}
