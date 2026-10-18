import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";
import { generateText } from "@/lib/providers/content-generation/generate-text";

/**
 * POST /api/setup/scan-linkedin
 *
 * Analyses LinkedIn posts to extract a voice profile.
 *
 * Two input modes:
 * 1. Pasted posts: Body: { companyId, posts: string }
 * 2. LinkedIn URL: Body: { companyId, linkedinUrl: string }
 *    - Posts cannot be fetched from a URL, so this asks the user to paste them
 *
 * Returns: { profile: { voice_description, writing_samples, banned_vocabulary, signature_devices, emotional_register } }
 */

const VOICE_ANALYSIS_PROMPT = `You are an expert writing style analyst who specialises in distinguishing authentic human voice from AI-generated content.

Analyse the provided writing samples and extract a detailed voice profile. Pay special attention to:
- Whether the writing shows signs of AI generation (ChatGPT, Claude, etc.) — common tells include: overuse of "delve", "landscape", "navigate", "leverage", "pivotal", "robust", "streamline", "synergy", "in today's fast-paced world", em-dashes everywhere, formulaic list structures, and overly smooth transitions.
- If AI patterns are detected, try to identify the UNDERLYING human voice beneath the AI polish — look at topic choices, argument structures, and any moments where authentic personality breaks through.

For each section below, provide specific, actionable observations based ONLY on what you see. Do not make generic statements.

Return ONLY valid JSON in this exact format:
{
  "voice_description": "2-3 sentences describing how this person writes. Include: sentence length patterns, formality level, declarative vs hedging style, use of questions, paragraph structure. If AI-generated patterns detected, note this and describe what their natural voice likely sounds like underneath.",
  "writing_samples": "3-5 short excerpts (10-20 words each) that best represent their MOST NATURAL voice. Prioritise sentences that feel genuinely human over polished AI output.",
  "banned_vocabulary": "Words and phrases they should AVOID. One per line. ALWAYS include generic AI buzzwords like: delve, landscape, navigate, leverage, pivotal, robust, streamline, foster, harness, cutting-edge, game-changer, in today's [anything]. Add any other over-used or inauthentic words from their samples.",
  "signature_devices": "Recurring structural patterns: how they open posts, transition between ideas, use lists vs paragraphs, rhetorical questions, em-dashes, ellipses, emojis, specific phrase patterns. Note which devices feel authentic vs AI-templated.",
  "emotional_register": "Where they sit on: formal-casual, understated-enthusiastic, first-person-third-person, expert-peer, instructional-conversational. Be specific about their position on each spectrum.",
  "ai_voice_detected": true/false,
  "ai_voice_notes": "If AI patterns detected: specific examples of AI-generated phrases found, estimated percentage of content that appears AI-written, and recommendations for developing a more authentic voice. If not detected: null."
}`;

const VOICE_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    voice_description: { type: "string" },
    writing_samples: { type: "string" },
    banned_vocabulary: { type: "string" },
    signature_devices: { type: "string" },
    emotional_register: { type: "string" },
    ai_voice_detected: { type: "boolean" },
    ai_voice_notes: { type: ["string", "null"] },
  },
  required: ["voice_description", "writing_samples", "banned_vocabulary", "signature_devices", "emotional_register", "ai_voice_detected", "ai_voice_notes"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, posts, linkedinUrl } = body;

  if (!companyId || (!posts && !linkedinUrl)) {
    return NextResponse.json(
      { error: "companyId and either posts or linkedinUrl are required" },
      { status: 400 }
    );
  }

  // A LinkedIn URL cannot be read from here, so supplied posts are required.
  let postsToAnalyse = posts || "";

  // A LinkedIn URL cannot be read from here, and asking a model to guess posts
  // from a URL would invent samples and present them as the person's voice.
  if (linkedinUrl && !postsToAnalyse) {
    return NextResponse.json(
      {
        error: "Could not retrieve posts from that LinkedIn URL. Please paste 5-10 recent posts manually instead.",
        needsManualPaste: true,
      },
      { status: 400 }
    );
  }

  try {
    const result = await generateText({
      companyId,
      systemPrompt: "You are a writing style analyst. You MUST return ONLY valid JSON with no preamble, explanation, markdown code fences, or any other text. Start your response with { and end with }.",
      userPrompt: `${VOICE_ANALYSIS_PROMPT}\n\n---\n\nLINKEDIN POSTS TO ANALYSE:\n\n${postsToAnalyse}`,
      maxTokens: 2000,
      jsonSchema: VOICE_ANALYSIS_SCHEMA,
    });
    const responseText = result.text;

    if (!responseText) {
      throw new Error("The analysis returned an empty response.");
    }

    // Strip markdown code fences if Claude wrapped the JSON (e.g. ```json ... ```)
    const stripped = responseText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[scan-linkedin] Non-JSON response");
      throw new Error("The analysis did not return valid JSON. Please try again.");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[scan-linkedin] JSON parse error");
      throw new Error("The analysis returned malformed JSON. Please try again.");
    }

    return NextResponse.json({
      profile: {
        voice_description: parsed.voice_description || "",
        writing_samples: parsed.writing_samples || "",
        banned_vocabulary: parsed.banned_vocabulary || "",
        signature_devices: parsed.signature_devices || "",
        emotional_register: parsed.emotional_register || "",
      },
      ai_voice_detected: parsed.ai_voice_detected || false,
      ai_voice_notes: parsed.ai_voice_notes || null,
    });
  } catch (err) {
    console.error("[scan-linkedin] voice analysis failed:", err);
    return NextResponse.json(
      { error: "We could not analyse that voice just now. Please try again, or ask AGENCY to check it." },
      { status: 500 }
    );
  }
}
