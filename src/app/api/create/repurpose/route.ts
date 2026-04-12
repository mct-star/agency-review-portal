import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import { callClaude } from "@/lib/providers/content-adaptation/claude-util";

export const maxDuration = 120;

/**
 * POST /api/create/repurpose
 *
 * Takes long-form content (pasted text or URL) and generates 7 derivative
 * content pieces: 5 social posts, 1 carousel, and 1 newsletter intro.
 *
 * Body: { companyId: string, content?: string, url?: string }
 *
 * Returns: { socialPosts, carousel, newsletterIntro }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, content, url } = body;

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  if (!content && !url) {
    return NextResponse.json(
      { error: "Either content or url is required" },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve source text
  let sourceText = content || "";

  if (url && !content) {
    try {
      const fetchRes = await fetch(url, {
        headers: { "User-Agent": "AgencyContentBot/1.0" },
      });

      if (!fetchRes.ok) {
        return NextResponse.json(
          { error: `Failed to fetch URL (${fetchRes.status})` },
          { status: 400 }
        );
      }

      const html = await fetchRes.text();
      // Strip HTML tags to extract text
      sourceText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    } catch (err) {
      return NextResponse.json(
        { error: `Could not fetch URL: ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 400 }
      );
    }
  }

  if (sourceText.length < 100) {
    return NextResponse.json(
      { error: "Source text is too short. Provide at least 100 characters of long-form content." },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch company context
  const { data: company } = await supabase
    .from("companies")
    .select("spokesperson_name")
    .eq("id", companyId)
    .single();

  const speakerName = company?.spokesperson_name || "the author";

  // Fetch voice profile for tone matching
  const { data: voiceProfile } = await supabase
    .from("company_voice_profiles")
    .select("voice_description")
    .eq("company_id", companyId)
    .is("spokesperson_id", null)
    .eq("is_active", true)
    .limit(1)
    .single();

  const voiceNote = voiceProfile?.voice_description
    ? `\n\nVOICE: Match this tone and style: ${voiceProfile.voice_description}`
    : "";

  // Resolve API key
  const resolved = await resolveProvider(companyId, "content_generation");
  const apiKey =
    (resolved?.credentials as Record<string, string>)?.apiKey ||
    (resolved?.credentials as Record<string, string>)?.api_key ||
    process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "No content generation provider configured. Add an API key in Settings." },
      { status: 400 }
    );
  }

  // Generate
  const systemPrompt = `You are a content repurposing expert. You write in the first person as ${speakerName}.${voiceNote}

Return ONLY valid JSON -- no markdown fences, no explanation.`;

  const userPrompt = `Take this long-form content and create 7 pieces of LinkedIn content from it.

Source content:
${sourceText.substring(0, 12000)}

Generate EXACTLY this structure as JSON:
{
  "socialPosts": [
    { "postType": "insight", "title": "...", "body": "...(150-250 words)" },
    { "postType": "contrarian", "title": "...", "body": "...(200-300 words)" },
    { "postType": "if_i_was", "title": "...", "body": "...(200-300 words)" },
    { "postType": "launch_story", "title": "...", "body": "...(200-350 words)" },
    { "postType": "tactical", "title": "...", "body": "...(150-250 words, as numbered steps)" }
  ],
  "carousel": {
    "title": "...",
    "slides": ["Slide 1 heading: body", "Slide 2 heading: body", "Slide 3...", "Slide 4...", "Slide 5..."]
  },
  "newsletterIntro": {
    "subject": "...",
    "body": "...(2 paragraphs, teaser style)"
  }
}

Rules:
- Each social post must take a DIFFERENT angle on the source material
- Opening hooks must be under 12 words
- No hashtags in the body
- No emojis except ♻️ in sign-offs`;

  try {
    const raw = await callClaude(apiKey, "claude-sonnet-4-20250514", systemPrompt, userPrompt, 8192);

    // Parse JSON -- handle potential markdown fences
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    // Validate structure
    const result = {
      socialPosts: Array.isArray(parsed.socialPosts)
        ? parsed.socialPosts.map((p: Record<string, unknown>) => ({
            postType: String(p.postType || "unknown"),
            title: String(p.title || "Untitled"),
            body: String(p.body || ""),
          }))
        : [],
      carousel: parsed.carousel
        ? {
            title: String(parsed.carousel.title || "Carousel"),
            slides: Array.isArray(parsed.carousel.slides)
              ? parsed.carousel.slides.map(String)
              : [],
          }
        : { title: "Carousel", slides: [] },
      newsletterIntro: parsed.newsletterIntro
        ? {
            subject: String(parsed.newsletterIntro.subject || ""),
            body: String(parsed.newsletterIntro.body || ""),
          }
        : { subject: "", body: "" },
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[repurpose] Generation failed:", err);
    return NextResponse.json(
      { error: `Content generation failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
