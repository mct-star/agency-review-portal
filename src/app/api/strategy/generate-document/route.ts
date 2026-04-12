import crypto from "crypto";
import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

// ── POST /api/strategy/generate-document ───────────────────
// Loads a completed strategy session + related data, calls Claude to generate
// a structured 8-section strategy document, and saves it to strategy_documents.

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { companyId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyId } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Non-admin users can only generate for their own company
  if (profile.role !== "admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createAdminSupabaseClient();

  try {
    // Load all strategy data in parallel
    const [companyRes, sessionRes, audiencesRes, positioningRes, arcsRes] =
      await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase
          .from("strategy_sessions")
          .select("*")
          .eq("company_id", companyId)
          .eq("status", "completed")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("strategy_audiences")
          .select("*")
          .eq("company_id", companyId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("strategy_positioning")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle(),
        supabase
          .from("strategy_narrative_arcs")
          .select("*")
          .eq("company_id", companyId)
          .order("week_number", { ascending: true }),
      ]);

    const company = companyRes.data;
    const session = sessionRes.data;
    const audiences = audiencesRes.data || [];
    const positioning = positioningRes.data || null;
    const narrativeArcs = arcsRes.data || [];

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (!session) {
      return NextResponse.json(
        { error: "No completed strategy session found. Complete the interview first." },
        { status: 400 }
      );
    }

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

    // Build the prompt
    const prompt = buildDocumentPrompt(company, session, audiences, positioning, narrativeArcs);

    // Call AI provider
    const provider = resolved.provider;
    const isAnthropic = provider === "anthropic_claude" || provider.startsWith("anthropic");

    let documentContent: Record<string, unknown>;

    if (isAnthropic) {
      const model = (resolved.settings.model as string) || "claude-sonnet-4-20250514";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      documentContent = parseDocumentResponse(text);
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
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errBody}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      documentContent = parseDocumentResponse(text);
    }

    // Determine version number
    const { data: existingDocs } = await supabase
      .from("strategy_documents")
      .select("version")
      .eq("company_id", companyId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = existingDocs ? existingDocs.version + 1 : 1;

    // Generate a short, URL-friendly share token
    const shareToken = crypto.randomUUID().slice(0, 12);

    // Save the document
    const { data: document, error: insertErr } = await supabase
      .from("strategy_documents")
      .insert({
        company_id: companyId,
        version: nextVersion,
        content: documentContent,
        share_token: shareToken,
        generated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ document });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate strategy document" },
      { status: 500 }
    );
  }
}

// ── Prompt builder ─────────────────────────────────────────

function buildDocumentPrompt(
  company: Record<string, unknown>,
  session: Record<string, unknown>,
  audiences: Array<Record<string, unknown>>,
  positioning: Record<string, unknown> | null,
  narrativeArcs: Array<Record<string, unknown>>
): string {
  const companyName = (company.name as string) || "the company";
  const industry = (company.industry as string) || "their industry";
  const responses = (session.responses as Record<string, unknown>) || {};

  const audienceSummary = audiences.length > 0
    ? audiences
        .map(
          (a) =>
            `- ${a.persona_name} (${a.job_title || "N/A"}): ${a.primary_problem || "N/A"}. Pain points: ${(a.pain_points as string[])?.join(", ") || "N/A"}`
        )
        .join("\n")
    : "No audiences defined yet.";

  const positioningSummary = positioning
    ? `Positioning statement: ${positioning.positioning_statement || "N/A"}
Differentiators: ${(positioning.differentiators as string[])?.join(", ") || "N/A"}
Competitor mistakes: ${positioning.competitor_mistakes || "N/A"}
Transformation: From "${positioning.transformation_before || "N/A"}" to "${positioning.transformation_after || "N/A"}"
StoryBrand guide: ${positioning.storybrand_guide || "N/A"}`
    : "No positioning data defined yet.";

  const arcsSummary = narrativeArcs.length > 0
    ? narrativeArcs
        .map(
          (a) =>
            `- Week ${a.week_number} (${a.phase}): ${a.theme_focus || "N/A"} / ${a.topic_focus || "N/A"}`
        )
        .join("\n")
    : "No narrative arcs defined yet.";

  return `You are a content strategist generating a comprehensive content strategy document for ${companyName} in the ${industry} sector.

Based on the following inputs, produce a structured strategy document with exactly 8 sections. Return your response as a valid JSON object with these exact keys:

{
  "executive_summary": "...",
  "audience_profiles": "...",
  "positioning_and_differentiation": "...",
  "voice_and_tone_guide": "...",
  "content_pillars_and_topic_bank": "...",
  "weekly_content_ecosystem": "...",
  "twelve_week_narrative_arc": "...",
  "success_metrics": "..."
}

Each value should be a rich markdown string (use ## subheadings, bullet points, bold text, etc.).

---

COMPANY: ${companyName}
INDUSTRY: ${industry}
DESCRIPTION: ${(company.description as string) || "N/A"}

INTERVIEW RESPONSES:
${JSON.stringify(responses, null, 2)}

AUDIENCES:
${audienceSummary}

POSITIONING:
${positioningSummary}

NARRATIVE ARCS:
${arcsSummary}

---

SECTION GUIDELINES:

1. **Executive Summary** - One-page overview of the strategy. Who the company is, what problem their content solves, and the 12-week outcome they can expect.

2. **Audience Profiles** - Detailed persona cards for each audience. Include their role, seniority, daily frustrations, what they search for, and how this company's content helps them.

3. **Positioning & Differentiation** - How the company stands apart. The core positioning statement, key differentiators, and what competitors get wrong that this company gets right.

4. **Voice & Tone Guide** - How the company should sound. Include tone descriptors, do/don't examples, vocabulary preferences, and how the voice flexes across content types (thought leadership vs. promotional vs. personal).

5. **Content Pillars & Topic Bank** - 3-5 content pillars with descriptions, plus 5-8 specific topic ideas per pillar. Each topic should include a working title and a one-line description.

6. **Weekly Content Ecosystem** - The recommended weekly posting rhythm. Which days, what content types (long-form, short-form, engagement, CTA), and how posts reference each other to create a cohesive narrative.

7. **12-Week Narrative Arc** - A week-by-week plan showing how the content builds. Include phase labels (Establish, Build, Challenge, Convert), weekly themes, and how each week connects to the next.

8. **Success Metrics** - KPIs to track, benchmarks for the first 12 weeks, and how to measure whether the strategy is working. Include engagement metrics, reach metrics, and business outcome metrics.

Return ONLY the JSON object, no surrounding text or markdown code fences.`;
}

// ── Response parser ────────────────────────────────────────

function parseDocumentResponse(text: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Validate expected keys exist
    const expectedKeys = [
      "executive_summary",
      "audience_profiles",
      "positioning_and_differentiation",
      "voice_and_tone_guide",
      "content_pillars_and_topic_bank",
      "weekly_content_ecosystem",
      "twelve_week_narrative_arc",
      "success_metrics",
    ];

    const result: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      result[key] = parsed[key] || null;
    }
    return result;
  } catch {
    // If JSON parsing fails, return the raw text in a fallback structure
    return {
      executive_summary: text,
      audience_profiles: null,
      positioning_and_differentiation: null,
      voice_and_tone_guide: null,
      content_pillars_and_topic_bank: null,
      weekly_content_ecosystem: null,
      twelve_week_narrative_arc: null,
      success_metrics: null,
    };
  }
}
