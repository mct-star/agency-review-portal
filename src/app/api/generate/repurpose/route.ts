import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import { callClaude } from "@/lib/providers/content-adaptation/claude-util";

export const maxDuration = 120;

/**
 * POST /api/generate/repurpose
 *
 * Takes long-form content and generates 7 derivative pieces using Claude.
 * Does NOT save to database -- the user reviews and selects which to keep.
 *
 * Body: { companyId: string, sourceText: string, spokespersonId?: string }
 *
 * Returns: { pieces: Array<{ type, title, body, firstComment }> }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, sourceText, spokespersonId } = body;

  if (!companyId || !sourceText) {
    return NextResponse.json(
      { error: "companyId and sourceText are required" },
      { status: 400 }
    );
  }

  if (sourceText.length < 100) {
    return NextResponse.json(
      { error: "Source text is too short. Provide at least 100 characters of long-form content." },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch company context
  const { data: company } = await supabase
    .from("companies")
    .select("spokesperson_name")
    .eq("id", companyId)
    .single();

  // If spokesperson specified, get their name
  let speakerName = company?.spokesperson_name || "the author";
  if (spokespersonId) {
    const { data: person } = await supabase
      .from("company_spokespersons")
      .select("name")
      .eq("id", spokespersonId)
      .eq("company_id", companyId)
      .single();
    if (person) speakerName = person.name;
  }

  // Fetch voice profile for tone matching
  const voiceQuery = spokespersonId
    ? supabase.from("company_voice_profiles").select("voice_description").eq("company_id", companyId).eq("spokesperson_id", spokespersonId).eq("is_active", true).limit(1).single()
    : supabase.from("company_voice_profiles").select("voice_description").eq("company_id", companyId).is("spokesperson_id", null).eq("is_active", true).limit(1).single();
  const { data: voiceProfile } = await voiceQuery;
  const voiceNote = voiceProfile?.voice_description
    ? `\n\nVOICE: Match this tone and style: ${voiceProfile.voice_description}`
    : "";

  // Resolve Claude API key
  const resolved = await resolveProvider(companyId, "content_generation");
  if (!resolved) {
    // Fall back to platform-level key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "No content generation provider configured. Add an API key in Settings." },
        { status: 400 }
      );
    }
    // Use platform key
    return generateRepurposedContent(apiKey, sourceText, speakerName, voiceNote);
  }

  const apiKey = (resolved.credentials as Record<string, string>).apiKey || (resolved.credentials as Record<string, string>).api_key;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Content provider API key not found" },
      { status: 500 }
    );
  }

  return generateRepurposedContent(apiKey, sourceText, speakerName, voiceNote);
}

async function generateRepurposedContent(
  apiKey: string,
  sourceText: string,
  speakerName: string,
  voiceNote: string
) {
  const systemPrompt = `You are a content strategist who specialises in repurposing long-form content into social media posts. You write in the first person as ${speakerName}.${voiceNote}

Return ONLY valid JSON -- no markdown fences, no explanation. The response must be a JSON array of exactly 7 objects.`;

  const userPrompt = `Take this long-form content and create 7 derivative pieces:

1. A Problem Diagnosis post (150-250 words) -- extract the core problem
2. A Contrarian Take post (200-300 words) -- find the boldest claim and build a post around it
3. An Expert Perspective post (200-300 words) -- "If I was..." angle from the content
4. A Tactical How-To post (150-250 words) -- extract actionable steps
5. A Personal Reflection post (250-400 words) -- humanise one insight
6. A carousel outline (5-7 slides) -- key takeaways as numbered points
7. A newsletter intro (100-150 words) -- teaser that drives to the full piece

For each, return a JSON object with these exact fields:
- "type": one of "problem_diagnosis", "contrarian_take", "expert_perspective", "how_to", "personal_reflection", "carousel", "newsletter_intro"
- "title": a compelling title for the piece
- "body": the full post text
- "firstComment": a first comment CTA (or null for carousel/newsletter)

SOURCE CONTENT:
${sourceText.substring(0, 12000)}`;

  try {
    const raw = await callClaude(apiKey, "claude-sonnet-4-20250514", systemPrompt, userPrompt, 8192);

    // Parse JSON -- handle potential markdown fences
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const pieces = JSON.parse(cleaned);

    if (!Array.isArray(pieces)) {
      throw new Error("Expected an array of pieces");
    }

    // Validate each piece has the required fields
    const validated = pieces.map((p: Record<string, unknown>) => ({
      type: String(p.type || "unknown"),
      title: String(p.title || "Untitled"),
      body: String(p.body || ""),
      firstComment: p.firstComment ? String(p.firstComment) : null,
    }));

    return NextResponse.json({ pieces: validated });
  } catch (err) {
    console.error("[repurpose] Generation failed:", err);
    return NextResponse.json(
      { error: `Content generation failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
