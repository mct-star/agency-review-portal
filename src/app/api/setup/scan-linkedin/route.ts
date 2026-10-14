import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import { callClaude, CLAUDE_SONNET } from "@/lib/providers/content-adaptation/claude-util";

/**
 * POST /api/setup/scan-linkedin
 *
 * Analyses LinkedIn posts to extract voice profile using Claude.
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

  // If a LinkedIn URL was provided, use Claude to extract posts from the profile
  let postsToAnalyse = posts || "";

  // Resolve the Claude provider — try this company first, then fall back to any company
  let resolved = await resolveProvider(companyId, "content_generation");

  if (!resolved) {
    // Fall back: find ANY company with a content generation provider
    const supabase = await createAdminSupabaseClient();
    const { data: configs } = await supabase
      .from("company_api_configs")
      .select("company_id")
      .eq("service_category", "content_generation")
      .eq("is_active", true)
      .limit(1);

    if (configs && configs.length > 0) {
      resolved = await resolveProvider(configs[0].company_id, "content_generation");
    }
  }

  if (!resolved) {
    return NextResponse.json(
      { error: "No AI provider configured. Add an Anthropic API key in any company's Setup > API Keys." },
      { status: 400 }
    );
  }

  const apiKey = resolved.credentials.api_key as string;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Content generation provider missing API key" },
      { status: 400 }
    );
  }

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
    const responseText = await callClaude(
      apiKey,
      CLAUDE_SONNET,
      "You are a writing style analyst. You MUST return ONLY valid JSON with no preamble, explanation, markdown code fences, or any other text. Start your response with { and end with }.",
      `${VOICE_ANALYSIS_PROMPT}\n\n---\n\nLINKEDIN POSTS TO ANALYSE:\n\n${postsToAnalyse}`,
      2000
    );

    if (!responseText) {
      throw new Error("The analysis returned an empty response.");
    }

    // Strip markdown code fences if Claude wrapped the JSON (e.g. ```json ... ```)
    const stripped = responseText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[scan-linkedin] Non-JSON response:", responseText.slice(0, 500));
      throw new Error(`Claude did not return valid JSON. This usually means the API key needs checking. Raw response starts with: "${responseText.slice(0, 80)}..."`);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[scan-linkedin] JSON parse error:", parseErr, "Raw:", jsonMatch[0].slice(0, 300));
      throw new Error("Claude returned malformed JSON. Please try again.");
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Voice analysis failed" },
      { status: 500 }
    );
  }
}
