import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ComplianceDetailClient from "@/components/compliance/ComplianceDetailClient";
import type { RegulatoryReviewResult } from "@/types/database";

const contentTypeLabels: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
};

interface PageProps {
  params: Promise<{ pieceId: string }>;
}

export default async function ComplianceDetailPage({ params }: PageProps) {
  const { pieceId } = await params;
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();

  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*, week:weeks(*)")
    .eq("id", pieceId)
    .single();

  if (!piece) notFound();

  // Authorization check
  const isAdmin = profile.role === "admin";
  if (!isAdmin && profile.company_id !== piece.company_id) {
    notFound();
  }

  const review = piece.regulatory_review as RegulatoryReviewResult | null;
  const hasReview = review && review.overallScore != null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 print:hidden">
        <Link href="/compliance" className="hover:text-gray-700">
          Compliance
        </Link>
        <span>/</span>
        <span className="text-gray-900">{piece.title}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase text-gray-400">
                {contentTypeLabels[piece.content_type] || piece.content_type}
              </span>
              {piece.post_type && (
                <>
                  <span className="text-gray-300">&#183;</span>
                  <span className="text-xs text-gray-400">{piece.post_type}</span>
                </>
              )}
            </div>
            <h1 className="mt-1 text-xl font-bold text-gray-900">{piece.title}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
              <span>Created {new Date(piece.created_at).toLocaleDateString()}</span>
              {piece.regulatory_reviewed_at && (
                <>
                  <span>&#183;</span>
                  <span>Reviewed {new Date(piece.regulatory_reviewed_at).toLocaleDateString()}</span>
                </>
              )}
              {review?.framework && (
                <>
                  <span>&#183;</span>
                  <span className="font-medium text-slate-700">{review.framework}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Client-side interactive component handles the rest */}
      <ComplianceDetailClient
        pieceId={pieceId}
        companyId={piece.company_id}
        weekId={piece.week_id}
        markdownBody={piece.markdown_body}
        firstComment={piece.first_comment}
        regulatoryStatus={piece.regulatory_status || "pending"}
        regulatoryScore={piece.regulatory_score}
        review={review}
        hasReview={!!hasReview}
      />

      {/* Print footer */}
      <div className="hidden print:block border-t border-gray-200 pt-4 text-xs text-gray-400">
        <p>Compliance Review Report - {piece.title} - Generated {new Date().toLocaleDateString()}</p>
        <p>Framework: {review?.framework || "N/A"} | Score: {review?.overallScore ?? "N/A"}/100</p>
      </div>
    </div>
  );
}
