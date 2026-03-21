import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import {
  buildRegulatoryContext,
  COUNTRY_PROFILES,
  UNIVERSAL_RULES,
} from "@/lib/generation/regulatory-knowledge";
import type { RegulatoryIssue } from "@/lib/generation/regulatory-knowledge";

/**
 * POST /api/review/regulatory
 *
 * Performs a legal and regulatory compliance review of content pieces.
 * Uses the proprietary regulatory knowledge base (compiled from AGENCY's
 * legal research, ABPI guidelines, and country-specific regulations) to
 * flag issues and offer remediation suggestions.
 *
 * Body: {
 *   companyId: string,
 *   weekId: string,
 *   targetCountries: string[],  // e.g. ["GB", "DE", "FR"]
 *   pieceIds?: string[],        // specific pieces, or all in week
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, weekId, targetCountries = ["GB"], pieceIds } = body;

  if (!companyId || !weekId) {
    return NextResponse.json({ error: "companyId and weekId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch content pieces
  let query = supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    .order("sort_order");

  if (pieceIds && pieceIds.length > 0) {
    query = query.in("id", pieceIds);
  }

  const { data: pieces } = await query;
  if (!pieces || pieces.length === 0) {
    return NextResponse.json({ error: "No content pieces found" }, { status: 404 });
  }

  // Fetch company info
  const { data: company } = await supabase
    .from("companies")
    .select("name, industry_vertical")
    .eq("id", companyId)
    .single();

  // Resolve Claude API key
  const provider = await resolveProvider(companyId, "content_generation");
  const apiKey = (provider?.credentials?.api_key as string) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  // Build the regulatory context
  const regulatoryContext = buildRegulatoryContext(targetCountries);
  const countryNames = targetCountries
    .map((c: string) => COUNTRY_PROFILES[c]?.name || c)
    .join(", ");

  // Review each piece
  const results: {
    pieceId: string;
    title: string;
    contentType: string;
    issues: RegulatoryIssue[];
    overallRisk: "low" | "medium" | "high" | "critical";
    summary: string;
  }[] = [];

  for (const piece of pieces) {
    const system = `You are a healthcare regulatory compliance reviewer with deep expertise in pharmaceutical advertising law across European markets. You have been trained on the ABPI Code of Practice, ANSM regulations (France), HWG (Germany), LMP/RDAMP (Belgium), and the Dutch Medicines Act.

Your task is to review a piece of marketing content for a healthcare company and identify any legal or regulatory compliance issues for the specified target markets.

${regulatoryContext}

COMPANY: ${company?.name || "Healthcare company"}
TARGET MARKETS: ${countryNames}
CONTENT TYPE: ${piece.content_type} (${piece.post_type || "general"})

REVIEW THE FOLLOWING CONTENT:

TITLE: ${piece.title}

BODY:
${piece.markdown_body}

${piece.first_comment ? `FIRST COMMENT:\n${piece.first_comment}` : ""}

INSTRUCTIONS:
1. Analyse the content for ANY mentions of:
   - Specific product/medicine names (REGULATORY risk)
   - Brand/company names (LEGAL risk — advertising law)
   - Healthcare services (MIXED risk)
   - Therapeutic claims or clinical data references
   - Off-label implications
   - Patient-facing vs HCP-facing content distinctions

2. Check against EACH target country's specific rules

3. Flag issues with the following severity levels:
   - "critical": Content is likely non-compliant and could trigger enforcement action
   - "warning": Content contains elements that need review by legal/regulatory team
   - "advisory": Best practice recommendation to reduce risk

4. For each issue, provide a specific, actionable suggestion for how to fix it

Respond with JSON (no code fences):
{
  "issues": [
    {
      "flag": "critical" | "warning" | "advisory",
      "category": "brand" | "product" | "service" | "formatting" | "claims" | "audience" | "channel",
      "title": "Short issue title",
      "description": "Detailed explanation of the compliance concern",
      "countries": ["GB", "DE"],
      "suggestion": "Specific suggestion for how to fix this issue"
    }
  ],
  "overallRisk": "low" | "medium" | "high" | "critical",
  "summary": "2-3 sentence overall assessment"
}

If the content appears compliant, return an empty issues array with overallRisk "low" and a positive summary.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: "Perform the regulatory compliance review now." }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[regulatory-review] API error for piece ${piece.id}:`, errText);
      results.push({
        pieceId: piece.id,
        title: piece.title,
        contentType: piece.content_type,
        issues: [],
        overallRisk: "medium",
        summary: `Review failed: ${res.status}`,
      });
      continue;
    }

    const data = await res.json();
    const text = data.content?.find((c: { type: string }) => c.type === "text")?.text || "";
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      results.push({
        pieceId: piece.id,
        title: piece.title,
        contentType: piece.content_type,
        issues: parsed.issues || [],
        overallRisk: parsed.overallRisk || "low",
        summary: parsed.summary || "",
      });
    } catch {
      results.push({
        pieceId: piece.id,
        title: piece.title,
        contentType: piece.content_type,
        issues: [],
        overallRisk: "medium",
        summary: "Failed to parse review results",
      });
    }
  }

  // Calculate overall stats
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const criticalCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.flag === "critical").length,
    0
  );
  const warningCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.flag === "warning").length,
    0
  );

  return NextResponse.json({
    targetCountries,
    countryNames,
    piecesReviewed: results.length,
    totalIssues,
    criticalCount,
    warningCount,
    results,
  });
}
