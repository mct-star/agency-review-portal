import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

/**
 * POST /api/setup/scan-linkedin
 *
 * Analyses pasted LinkedIn posts to extract voice profile using Claude.
 *
 * Body: { companyId, posts: string }
 * Returns: { profile: { voice_description, writing_samples, banned_vocabulary, signature_devices, emotional_register } }
 */

const VOICE_ANALYSIS_PROMPT = `You are a writing style analyst. Analyse these LinkedIn posts and extract a detailed voice profile.

For each section below, provide specific, actionable observations based ONLY on what you see in the posts. Do not make generic statements.

Return ONLY valid JSON in this exact format:
{
  "voice_description": "2-3 sentences describing how this person writes. Include: sentence length patterns, formality level, declarative vs hedging style, use of questions, paragraph structure.",
  "writing_samples": "3-5 short excerpts (10-20 words each) that best represent their natural voice. Choose the most distinctive sentences.",
  "banned_vocabulary": "Words and phrases they clearly AVOID or would never use, based on patterns. One per line. Include generic AI-sounding words if absent from their posts.",
  "signature_devices": "Recurring structural patterns: how they open posts, transition between ideas, use lists vs paragraphs, rhetorical questions, em-dashes, ellipses, emojis, specific phrase patterns.",
  "emotional_register": "Where they sit on: formal-casual, understated-enthusiastic, first-person-third-person, expert-peer, instructional-conversational. Be specific about their position on each spectrum."
}`;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, posts } = body;

  if (!companyId || !posts) {
    return NextResponse.json(
      { error: "companyId and posts are required" },
      { status: 400 }
    );
  }

  // Resolve the Claude provider for this company
  const resolved = await resolveProvider(companyId, "content_generation");

  if (!resolved) {
    return NextResponse.json(
      { error: "No content generation provider configured. Add an Anthropic API key in Setup > API Keys." },
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

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: (resolved.settings.model as string) || "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `${VOICE_ANALYSIS_PROMPT}\n\n---\n\nLINKEDIN POSTS TO ANALYSE:\n\n${posts}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error (${claudeRes.status}): ${err}`);
    }

    const claudeData = await claudeRes.json();
    const responseText = claudeData.content?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Claude did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      profile: {
        voice_description: parsed.voice_description || "",
        writing_samples: parsed.writing_samples || "",
        banned_vocabulary: parsed.banned_vocabulary || "",
        signature_devices: parsed.signature_devices || "",
        emotional_register: parsed.emotional_register || "",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Voice analysis failed" },
      { status: 500 }
    );
  }
}
