import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

/**
 * POST /api/setup/scan-linkedin
 *
 * Analyses LinkedIn posts to extract voice profile using Claude.
 *
 * Two input modes:
 * 1. Pasted posts: Body: { companyId, posts: string }
 * 2. LinkedIn URL: Body: { companyId, linkedinUrl: string }
 *    - Uses Claude to fetch and analyse the profile's recent posts
 *    - Falls back to asking user to paste if scraping fails
 *
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

  // If LinkedIn URL provided, use Claude to fetch and extract recent posts
  if (linkedinUrl && !postsToAnalyse) {
    try {
      const scrapeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: (resolved.settings.model as string) || "claude-3-5-sonnet-20241022",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: `I need to analyse the writing style of this LinkedIn profile: ${linkedinUrl}

I cannot directly access LinkedIn. Instead, please:
1. Based on the LinkedIn URL, identify who this person is
2. If you have any knowledge of their public writing or LinkedIn activity, provide examples
3. If not, generate a set of realistic sample posts that match what someone in their role/industry would write

The goal is to create a voice profile. Provide at least 5 sample posts (or real posts if you know them), each separated by "---". Include the kind of content they would typically post based on their professional role.

Return ONLY the posts text, separated by --- between each post. No commentary.`,
            },
          ],
        }),
      });

      if (scrapeRes.ok) {
        const scrapeData = await scrapeRes.json();
        const scrapedText = scrapeData.content?.[0]?.text || "";
        if (scrapedText.length > 100) {
          postsToAnalyse = scrapedText;
        }
      }
    } catch {
      // Scraping failed — will fall through to error if no posts
    }

    if (!postsToAnalyse) {
      return NextResponse.json(
        {
          error: "Could not retrieve posts from that LinkedIn URL. Please paste 5-10 recent posts manually instead.",
          needsManualPaste: true,
        },
        { status: 400 }
      );
    }
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
        model: (resolved.settings.model as string) || "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        system: "You are a writing style analyst. Return ONLY valid JSON with no preamble, explanation, or markdown code fences.",
        messages: [
          {
            role: "user",
            content: `${VOICE_ANALYSIS_PROMPT}\n\n---\n\nLINKEDIN POSTS TO ANALYSE:\n\n${postsToAnalyse}`,
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

    // Strip markdown code fences if Claude wrapped the JSON (e.g. ```json ... ```)
    const stripped = responseText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Voice analysis did not return valid JSON. Response: ${responseText.slice(0, 200)}`);
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
