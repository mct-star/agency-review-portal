import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateComplianceReportPdf } from "@/lib/pdf/compliance-report";

/**
 * GET /api/export/compliance-pdf?pieceId=xxx&companyId=xxx
 *
 * Generate and download a PDF of the compliance report for a content piece.
 * Returns the PDF as a binary download with Content-Disposition header.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pieceId = searchParams.get("pieceId");
  const companyId = searchParams.get("companyId");

  if (!pieceId || !companyId) {
    return NextResponse.json(
      { error: "pieceId and companyId are required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch content piece
  const { data: piece, error: pieceError } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", pieceId)
    .eq("company_id", companyId)
    .single();

  if (pieceError || !piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  // Fetch company
  const { data: company } = await supabase
    .from("companies")
    .select("name, brand_color")
    .eq("id", companyId)
    .single();

  // Fetch latest regulatory review
  const { data: review } = await supabase
    .from("regulatory_reviews")
    .select("*")
    .eq("content_piece_id", pieceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!review) {
    return NextResponse.json(
      { error: "No compliance review found for this content piece" },
      { status: 404 }
    );
  }

  // Fetch spokesperson name if available
  let spokespersonName = "N/A";
  if (piece.spokesperson_id) {
    const { data: person } = await supabase
      .from("company_spokespersons")
      .select("name")
      .eq("id", piece.spokesperson_id)
      .single();
    if (person) spokespersonName = person.name;
  }

  // Build config
  const reportId = `RPT-${pieceId.slice(0, 8).toUpperCase()}`;
  const generatedAt = new Date().toISOString().split("T")[0];

  try {
    const pdfBuffer = await generateComplianceReportPdf({
      review: {
        ...review,
        issues: review.issues || [],
        passedChecks: review.passed_checks || [],
        overallScore: review.overall_score || 0,
        riskLevel: review.risk_level || "low",
        targetCountries: review.target_countries || ["GB"],
        reviewedAt: review.created_at,
      },
      markdownBody: piece.markdown_body || "",
      firstComment: piece.first_comment || null,
      regulatoryScore: review.overall_score || 0,
      regulatoryStatus: piece.regulatory_status || "pending",
      companyName: company?.name || "Company",
      brandColor: company?.brand_color || "#7C3AED",
      postTitle: piece.title || piece.post_type || "Content Review",
      postType: piece.post_type || "social_post",
      spokespersonName,
      framework: review.framework || "ABPI",
      scheduledDate: piece.scheduled_date || undefined,
      reportId,
      generatedAt,
    });

    // Return as downloadable PDF
    const filename = `compliance-report-${reportId}-${generatedAt}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("[compliance-pdf] Generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF generation failed" },
      { status: 500 }
    );
  }
}
