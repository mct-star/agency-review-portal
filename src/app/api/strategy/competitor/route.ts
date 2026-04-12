import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";
import { resolveProvider } from "@/lib/providers";

export const maxDuration = 60;

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { companyId?: string; linkedInUrl?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyId, linkedInUrl } = body;

  if (!companyId || !linkedInUrl) {
    return NextResponse.json(
      { error: "companyId and linkedInUrl are required" },
      { status: 400 }
    );
  }

  // Non-admin users can only analyse for their own company
  if (profile.role !== "admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Extract LinkedIn slug
  const slugMatch = linkedInUrl.match(
    /linkedin\.com\/(in|company)\/([^/?#]+)/
  );
  const linkedInSlug = slugMatch ? slugMatch[2] : linkedInUrl.trim();
  const profileType = slugMatch?.[1] === "company" ? "company" : "person";

  try {
    // Resolve AI provider
    const resolved = await resolveProvider(companyId, "content_generation");
    if (!resolved) {
      return NextResponse.json(
        { error: "No content generation provider configured for this company." },
        { status: 400 }
      );
    }

    const apiKey = resolved.credentials.api_key as string;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Content generation provider has no API key configured." },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(linkedInSlug, profileType, linkedInUrl);

    // Call AI provider
    const provider = resolved.provider;
    const isAnthropic =
      provider === "anthropic_claude" || provider.startsWith("anthropic");

    let responseText: string;

    if (isAnthropic) {
      const model =
        (resolved.settings.model as string) || "claude-sonnet-4-20250514";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      responseText = data.content?.[0]?.text || "";
    } else {
      // OpenAI-compatible fallback
      const model = (resolved.settings.model as string) || "gpt-4o";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || "";
    }

    const parsed = parseResponse(responseText);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to analyse competitor",
      },
      { status: 500 }
    );
  }
}

function buildPrompt(
  slug: string,
  profileType: string,
  originalUrl: string
): string {
  return `You are a competitive content strategist. Analyse the LinkedIn ${profileType} "${slug}" (${originalUrl}) and produce a competitor content gap analysis.

Based on your knowledge of this ${profileType}'s likely content strategy on LinkedIn, return a JSON object with exactly these keys:

{
  "competitorName": "Their name or company name",
  "postingFrequency": "e.g. 3-4 times per week",
  "contentMix": [
    { "type": "Thought Leadership", "percentage": 40, "color": "#7C3AED" },
    { "type": "Case Studies", "percentage": 25, "color": "#2563EB" },
    { "type": "Promotional", "percentage": 20, "color": "#D97706" },
    { "type": "Engagement", "percentage": 15, "color": "#059669" }
  ],
  "topTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "contentGaps": [
    {
      "topic": "A topic they are NOT covering that their audience needs",
      "whyItMatters": "Why this gap matters for their audience",
      "suggestedPostType": "e.g. carousel, long-form post, video",
      "suggestedAngle": "A specific angle you could take to own this topic"
    }
  ],
  "strengths": [
    {
      "strength": "Something they do well in their content",
      "counterStrategy": "How to compete with or differentiate from this strength"
    }
  ]
}

Rules:
- contentMix should have 3-6 items, percentages totalling 100
- topTopics should have 5-8 items
- contentGaps should have 4-6 items - these are topics the competitor is NOT covering but should be
- strengths should have 3-5 items
- Use hex colours for contentMix (violet, blue, amber, emerald, rose, cyan)
- Be specific and actionable, not generic
- If you don't have specific knowledge of this profile, make reasonable inferences based on their industry and role

Return ONLY the JSON object, no surrounding text or markdown code fences.`;
}

function parseResponse(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      "Failed to parse AI response. Please try again."
    );
  }
}
