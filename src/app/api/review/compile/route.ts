import { reviewRules } from "@/lib/content-rules/review";
import type { ResolvedRules } from "@/lib/content-rules/resolve";
import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runQualityTests } from "@/lib/generation/quality-tests";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import type { ContentPiece, ContentImage, ContentAsset } from "@/types/database";

/**
 * POST /api/review/compile
 *
 * Compiles a formal review document for a week (Atom 13).
 * Runs quality tests on every piece and generates a structured
 * review document showing content, quality scores, and issues.
 *
 * Body: { weekId: string }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { weekId } = body;
  if (!weekId) {
    return NextResponse.json({ error: "weekId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch week + company
  const { data: week } = await supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .eq("id", weekId)
    .single();

  if (!week) {
    return NextResponse.json({ error: "Week not found" }, { status: 404 });
  }

  // Fetch all pieces with assets
  const { data: pieces } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    .eq("company_id", week.company_id)
    .order("sort_order");

  if (!pieces || pieces.length === 0) {
    return NextResponse.json({ error: "No content pieces in this week" }, { status: 404 });
  }

  // Fetch signoff for quality testing
  const { data: signoff } = await supabase
    .from("company_signoffs")
    .select("signoff_text")
    .eq("company_id", week.company_id)
    .eq("is_active", true)
    .limit(1)
    .single();

  const { data: ruleAssets, error: ruleAssetError } = await supabase.from('content_assets')
    .select('content_piece_id, asset_metadata').in('content_piece_id', pieces.map(piece => piece.id));
  if (ruleAssetError) return NextResponse.json({ error: 'Could not load rules provenance for review.' }, { status: 500 });

  // Run quality tests on each piece
  const pieceReviews = (pieces as ContentPiece[]).map((piece) => {
    const asset = ruleAssets?.find(asset => asset.content_piece_id === piece.id && asset.asset_metadata?.original_type === 'content_rules_provenance');
    let policy: ReturnType<typeof reviewRules>;
    try { policy = reviewRules(asset?.asset_metadata?.rules as ResolvedRules | undefined, week.company_id); }
    catch { policy = { rules: undefined, status: 'missing', message: 'Rules provenance is invalid for this company. Explicit scoped review is required.' }; }
    const validation = runQualityTests(
      piece.markdown_body,
      piece.title,
      piece.first_comment,
      {
        contentType: piece.content_type,
        rules: policy.rules,
        signoffText: signoff?.signoff_text || null,
        ctaUrl: null, // Can't check CTA location without slot data
        wordCountMin: null,
        wordCountMax: null,
        postTypeSlug: piece.post_type,
      }
    );

    return {
      title: piece.title,
      postType: piece.post_type,
      dayOfWeek: piece.day_of_week,
      scheduledTime: piece.scheduled_time,
      wordCount: piece.word_count,
      approvalStatus: piece.approval_status,
      qualityPassed: policy.status === "current" && !!policy.rules && validation.allPassed,
      rulesHash: policy.rules?.hash || null,
      rulesStatus: policy.status,
      rulesMessage: policy.message,
      testResults: (policy.rules ? validation.allResults : []).map((r) => ({
        test: r.testName,
        passed: r.passed,
        message: r.message,
        severity: r.severity,
      })),
      criticalIssues: policy.rules ? [...validation.criticalFailures.map((r) => r.message), ...(policy.status === "stale" ? [policy.message] : [])] : [policy.message],
      highIssues: policy.rules ? validation.highFailures.map((r) => r.message) : [],
    };
  });

  // Compile the review document
  const company = week.company as { name: string; spokesperson_name: string | null };
  const totalPieces = pieceReviews.length;
  const passedPieces = pieceReviews.filter((p) => p.qualityPassed).length;
  const criticalCount = pieceReviews.reduce((sum, p) => sum + p.criticalIssues.length, 0);
  const highCount = pieceReviews.reduce((sum, p) => sum + p.highIssues.length, 0);

  const compiledContent = `# ${formatWeekLabel(week.date_start, week.week_number)} Review Document
## ${company.name} | ${week.date_start} | ${week.date_end}
${week.pillar ? `**Pillar:** ${week.pillar}` : ""}${week.theme ? ` | **Theme:** ${week.theme}` : ""}${week.subject ? ` | **Subject:** ${week.subject}` : ""}

---

## Quality Summary

| Metric | Value |
|--------|-------|
| Total Pieces | ${totalPieces} |
| Quality Passed | ${passedPieces}/${totalPieces} (${Math.round((passedPieces / totalPieces) * 100)}%) |
| Critical Issues | ${criticalCount} |
| High Issues | ${highCount} |
| Approval Status | ${pieces.filter((p: ContentPiece) => p.approval_status === "approved").length}/${totalPieces} approved |

---

## Content Review

${pieceReviews
  .map(
    (p) => `### ${p.dayOfWeek || ""} ${p.scheduledTime || ""} | ${p.title}
**Rules:** ${p.rulesStatus} | ${p.rulesHash || "not recorded"} | ${p.rulesMessage}
**Post Type:** ${p.postType || "N/A"} | **Words:** ${p.wordCount || "N/A"} | **Quality:** ${p.qualityPassed ? "PASS" : "FAIL"} | **Status:** ${p.approvalStatus}

${
  p.criticalIssues.length > 0
    ? `**Critical Issues:**\n${p.criticalIssues.map((i) => `- ${i}`).join("\n")}\n`
    : ""
}${
  p.highIssues.length > 0
    ? `**High Issues:**\n${p.highIssues.map((i) => `- ${i}`).join("\n")}\n`
    : ""
}${p.qualityPassed ? "All quality tests passed." : ""}

---`
  )
  .join("\n\n")}

## Test Results Detail

${pieceReviews
  .map(
    (p) =>
      `**${p.title}**\n${p.testResults.map((t) => `- [${t.passed ? "PASS" : "FAIL"}] ${t.test}: ${t.message}`).join("\n")}`
  )
  .join("\n\n")}

---

*Generated by AGENCY Copy Magic | ${new Date().toISOString()}*
`;

  // Store the review document
  const qualitySummary = {
    totalPieces,
    passedPieces,
    criticalCount,
    highCount,
    passRate: Math.round((passedPieces / totalPieces) * 100),
    pieceReviews,
  };

  const { data: doc } = await supabase
    .from("review_documents")
    .upsert(
      {
        week_id: weekId,
        company_id: week.company_id,
        compiled_content: compiledContent,
        quality_summary: qualitySummary,
        compiled_at: new Date().toISOString(),
      },
      { onConflict: "week_id" }
    )
    .select()
    .single();

  return NextResponse.json({
    reviewDocId: doc?.id,
    qualitySummary: {
      totalPieces,
      passedPieces,
      criticalCount,
      highCount,
      passRate: Math.round((passedPieces / totalPieces) * 100),
    },
    compiledContent,
  });
}
