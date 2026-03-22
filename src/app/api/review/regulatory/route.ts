import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import {
  buildRegulatoryContext,
  COUNTRY_PROFILES,
} from "@/lib/generation/regulatory-knowledge";
import type { RegulatoryIssue } from "@/lib/generation/regulatory-knowledge";

/** Regulatory framework labels */
const FRAMEWORK_LABELS: Record<string, string> = {
  abpi: "ABPI Code (UK Pharma)",
  fda: "FDA (US)",
  mhra: "MHRA (UK Medical Devices)",
  eu_mdr: "EU MDR",
  general_healthcare: "General Healthcare",
  custom: "Custom",
};

/**
 * POST /api/review/regulatory
 *
 * Performs a legal and regulatory compliance review of content pieces.
 * Uses the proprietary regulatory knowledge base (compiled from AGENCY's
 * legal research, ABPI guidelines, and country-specific regulations) to
 * flag issues and offer remediation suggestions.
 *
 * Enhanced in v2 to return sentence-level scoring, compliance scores,
 * passed checks, and persist results to the content_pieces table.
 *
 * Body: {
 *   companyId: string,
 *   weekId?: string,          // review all pieces in a week
 *   pieceIds?: string[],      // OR specific pieces
 *   targetCountries?: string[],  // e.g. ["GB", "DE", "FR"]
 *   framework?: string,       // override company default
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, weekId, targetCountries = ["GB"], pieceIds, framework } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  if (!weekId && (!pieceIds || pieceIds.length === 0)) {
    return NextResponse.json({ error: "weekId or pieceIds required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch content pieces
  let query = supabase
    .from("content_pieces")
    .select("*")
    .order("sort_order");

  if (weekId) {
    query = query.eq("week_id", weekId);
  }

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
    .select("name, industry_vertical, regulatory_framework")
    .eq("id", companyId)
    .single();

  const activeFramework = framework || company?.regulatory_framework || "general_healthcare";
  const frameworkLabel = FRAMEWORK_LABELS[activeFramework] || activeFramework;

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
    overallScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    framework: string;
    issues: (RegulatoryIssue & {
      sentence?: string;
      riskLevel?: string;
      explanation?: string;
      regulation?: string;
    })[];
    passedChecks: string[];
    summary: string;
  }[] = [];

  for (const piece of pieces) {
    const system = `You are a healthcare regulatory compliance reviewer with deep expertise in pharmaceutical advertising law across European markets. You have been trained on the ABPI Code of Practice, ANSM regulations (France), HWG (Germany), LMP/RDAMP (Belgium), and the Dutch Medicines Act.

Your task is to review a piece of marketing content for a healthcare company and identify any legal or regulatory compliance issues for the specified target markets.

${regulatoryContext}

COMPANY: ${company?.name || "Healthcare company"}
TARGET MARKETS: ${countryNames}
REGULATORY FRAMEWORK: ${frameworkLabel}
CONTENT TYPE: ${piece.content_type} (${piece.post_type || "general"})

REVIEW THE FOLLOWING CONTENT:

TITLE: ${piece.title}

BODY:
${piece.markdown_body}

${piece.first_comment ? `FIRST COMMENT:\n${piece.first_comment}` : ""}

INSTRUCTIONS:
1. Analyse the content sentence by sentence for ANY mentions of:
   - Specific product/medicine names (REGULATORY risk)
   - Brand/company names (LEGAL risk -- advertising law)
   - Healthcare services (MIXED risk)
   - Therapeutic claims or clinical data references
   - Off-label implications
   - Patient-facing vs HCP-facing content distinctions
   - Missing disclaimers or required disclosures
   - Competitor references or disparagement
   - Misleading statistics or unsubstantiated claims

2. Check against EACH target country's specific rules

3. Score each issue with a risk level:
   - "high": Content is likely non-compliant and could trigger enforcement action
   - "medium": Content contains elements that need review by legal/regulatory team
   - "low": Best practice recommendation to reduce risk

4. Categorize each issue as one of: medical_claim, off_label, misleading, missing_disclaimer, competitor_reference, brand, product, service, formatting, claims, audience, channel

5. For each issue, quote the specific sentence that triggered it, explain the concern, cite the specific regulation, and provide a compliant alternative

6. List all compliance checks that PASSED (things done well)

7. Calculate an overall compliance score from 0-100 where:
   - 100 = fully compliant, no issues
   - 80-99 = minor advisory issues only
   - 60-79 = some warnings that need attention
   - 40-59 = significant compliance concerns
   - 0-39 = critical non-compliance

Respond with JSON (no code fences):
{
  "overallScore": 85,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "issues": [
    {
      "sentence": "The exact sentence from the content",
      "riskLevel": "high",
      "category": "medical_claim",
      "title": "Short issue title",
      "description": "Detailed explanation of the compliance concern",
      "explanation": "Why this is a regulatory issue under the applicable framework",
      "countries": ["GB", "DE"],
      "suggestion": "Specific compliant alternative text",
      "regulation": "ABPI Code Section 7.2"
    }
  ],
  "passedChecks": [
    "No competitor disparagement detected",
    "No patient data references",
    "Appropriate tone for professional audience"
  ],
  "summary": "2-3 sentence overall assessment"
}

If the content appears compliant, return an empty issues array with overallScore 100, riskLevel "low", a list of passed checks, and a positive summary.`;

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
        overallScore: 0,
        riskLevel: "medium",
        framework: frameworkLabel,
        issues: [],
        passedChecks: [],
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
      const overallScore = parsed.overallScore ?? (parsed.issues?.length === 0 ? 100 : 50);
      const riskLevel = parsed.riskLevel || (overallScore >= 80 ? "low" : overallScore >= 60 ? "medium" : overallScore >= 40 ? "high" : "critical");

      const result = {
        pieceId: piece.id,
        title: piece.title,
        contentType: piece.content_type,
        overallScore,
        riskLevel: riskLevel as "low" | "medium" | "high" | "critical",
        framework: frameworkLabel,
        issues: parsed.issues || [],
        passedChecks: parsed.passedChecks || [],
        summary: parsed.summary || "",
      };

      results.push(result);

      // Persist the review result to the content_pieces table
      const regulatoryStatus = result.issues.length === 0 ? "clean" : "flagged";
      await supabase
        .from("content_pieces")
        .update({
          regulatory_status: regulatoryStatus,
          regulatory_score: overallScore,
          regulatory_review: {
            overallScore,
            riskLevel,
            framework: frameworkLabel,
            issues: result.issues,
            passedChecks: result.passedChecks,
            reviewedAt: new Date().toISOString(),
            targetCountries,
          },
          regulatory_framework: activeFramework,
          regulatory_reviewed_at: new Date().toISOString(),
        })
        .eq("id", piece.id);
    } catch {
      results.push({
        pieceId: piece.id,
        title: piece.title,
        contentType: piece.content_type,
        overallScore: 0,
        riskLevel: "medium",
        framework: frameworkLabel,
        issues: [],
        passedChecks: [],
        summary: "Failed to parse review results",
      });
    }
  }

  // Calculate overall stats
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const criticalCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.riskLevel === "high" || (i as { flag?: string }).flag === "critical").length,
    0
  );
  const warningCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.riskLevel === "medium" || (i as { flag?: string }).flag === "warning").length,
    0
  );
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length)
    : 0;

  return NextResponse.json({
    targetCountries,
    countryNames,
    framework: frameworkLabel,
    piecesReviewed: results.length,
    totalIssues,
    criticalCount,
    warningCount,
    averageScore: avgScore,
    results,
  });
}
