import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ComplianceDetailClient from "@/components/compliance/ComplianceDetailClient";
import LinkedInPostMockup from "@/components/mockups/LinkedInPostMockup";
import { getPostDisplayName, getPostTypeBadge } from "@/lib/post-display-name";
import type { RegulatoryReviewResult } from "@/types/database";

const contentTypeLabels: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
};

const frameworkLabels: Record<string, string> = {
  // Healthcare / Pharma
  abpi: "ABPI Code of Practice (UK Pharma)",
  fda: "FDA Regulatory Framework (US)",
  mhra: "MHRA Guidelines (UK Medical Devices)",
  eu_mdr: "EU Medical Device Regulation",
  general_healthcare: "General Healthcare Compliance",
  // Financial Services
  fca: "FCA Financial Promotions (UK)",
  mifid: "MiFID II Marketing Requirements (EU)",
  general_finance: "Financial Services Compliance",
  // Legal
  sra: "SRA Advertising Rules (UK)",
  general_legal: "Legal Marketing Compliance",
  // Energy
  ofgem: "Ofgem Guidelines (UK Energy)",
  green_claims: "Green Claims / Greenwashing Rules",
  // General
  asa_cap: "ASA / CAP Code (UK Advertising)",
  gdpr_marketing: "GDPR Marketing Compliance",
  general: "General Marketing Compliance",
  custom: "Custom Framework",
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

  // Fetch company details for branding
  const { data: company } = await supabase
    .from("companies")
    .select("name, logo_url, brand_color, regulatory_framework")
    .eq("id", piece.company_id)
    .single();

  // Fetch spokesperson if available
  const { data: spokesperson } = await supabase
    .from("company_spokespersons")
    .select("name, tagline, profile_picture_url")
    .eq("company_id", piece.company_id)
    .eq("is_primary", true)
    .single();

  // Fetch primary image for the post mockup
  const { data: primaryImage } = await supabase
    .from("content_assets")
    .select("file_url")
    .eq("content_piece_id", pieceId)
    .eq("asset_type", "image")
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  // Fallback: also check content_images table
  const imageUrl = primaryImage?.file_url || null;
  let postImageUrl = imageUrl;
  if (!postImageUrl) {
    const { data: legacyImage } = await supabase
      .from("content_images")
      .select("public_url")
      .eq("content_piece_id", pieceId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    postImageUrl = legacyImage?.public_url || null;
  }

  const review = piece.regulatory_review as RegulatoryReviewResult | null;
  const hasReview = review && review.overallScore != null;

  const displayName = getPostDisplayName({
    title: piece.title,
    postType: piece.post_type,
    dayOfWeek: piece.day_of_week,
    contentType: piece.content_type,
  });
  const badge = getPostTypeBadge(piece.post_type);
  const framework = review?.framework || company?.regulatory_framework || "general_healthcare";

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:space-y-4 print:max-w-none">
      {/* Breadcrumb — hidden in print */}
      <div className="flex items-center gap-2 text-sm text-gray-500 print:hidden">
        <Link href="/compliance" className="hover:text-gray-700">
          Compliance
        </Link>
        <span>/</span>
        <span className="text-gray-900 truncate">{displayName}</span>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          REPORT HEADER — Professional branded header
          ═══════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Brand colour bar */}
        <div className="h-1.5" style={{ backgroundColor: company?.brand_color || "#1e293b" }} />

        <div className="p-6">
          {/* Logos row */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* AGENCY logo (platform provider) */}
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold tracking-widest text-gray-900" style={{ fontFamily: "system-ui" }}>
                  AGENCY
                </div>
                <span className="text-[9px] text-gray-400 tracking-wide">CONTENT PLATFORM</span>
              </div>
            </div>

            {/* Client logo */}
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-8 object-contain"
              />
            ) : (
              <div className="text-sm font-semibold text-gray-700">
                {company?.name || "Company"}
              </div>
            )}
          </div>

          {/* Report title */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="h-5 w-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <h1 className="text-lg font-bold text-gray-900">
                Regulatory Compliance Report
              </h1>
            </div>

            {/* Content piece info */}
            <div className="mt-3 flex items-center gap-3">
              <span
                className="rounded px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: badge.color }}
              >
                {badge.label}
              </span>
              <h2 className="text-base font-medium text-gray-800">{displayName}</h2>
            </div>

            {/* Meta information grid */}
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4 text-xs">
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Content Type</span>
                <p className="mt-0.5 font-medium text-gray-700">{contentTypeLabels[piece.content_type] || piece.content_type}</p>
              </div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Framework</span>
                <p className="mt-0.5 font-medium text-gray-700">{frameworkLabels[framework] || framework}</p>
              </div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Created</span>
                <p className="mt-0.5 font-medium text-gray-700">{new Date(piece.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Reviewed</span>
                <p className="mt-0.5 font-medium text-gray-700">
                  {piece.regulatory_reviewed_at
                    ? new Date(piece.regulatory_reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "Pending"}
                </p>
              </div>
              {spokesperson && (
                <div>
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">Spokesperson</span>
                  <p className="mt-0.5 font-medium text-gray-700">{spokesperson.name}</p>
                </div>
              )}
              {piece.post_type && (
                <div>
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">Post Type</span>
                  <p className="mt-0.5 font-medium text-gray-700">{piece.post_type}</p>
                </div>
              )}
              {piece.day_of_week && (
                <div>
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">Scheduled</span>
                  <p className="mt-0.5 font-medium text-gray-700">{piece.day_of_week} {piece.scheduled_time || ""}</p>
                </div>
              )}
              <div>
                <span className="text-gray-400 uppercase tracking-wider text-[10px]">Company</span>
                <p className="mt-0.5 font-medium text-gray-700">{company?.name || "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          POST PREVIEW — LinkedIn mockup showing how the post will appear
          ═══════════════════════════════════════════════════════════ */}
      {piece.content_type === "social_post" && spokesperson && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="flex items-center text-sm font-semibold text-gray-900">
              <span className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white tracking-wider mr-3">00</span>
              Post Preview
            </h2>
          </div>
          <div className="p-6">
            <LinkedInPostMockup
              authorName={spokesperson.name}
              authorTagline={spokesperson.tagline || ""}
              authorPhotoUrl={spokesperson.profile_picture_url || null}
              postText={piece.markdown_body || ""}
              imageUrl={postImageUrl}
              firstComment={piece.first_comment || null}
              timeAgo="Just now"
              maxLines={4}
            />
          </div>
        </div>
      )}

      {/* Client-side interactive component handles the review body */}
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
        authorName={spokesperson?.name || company?.name || undefined}
        authorTagline={spokesperson?.tagline || undefined}
        authorAvatarUrl={spokesperson?.profile_picture_url || undefined}
        postImageUrl={postImageUrl}
        brandColor={company?.brand_color || undefined}
        postType={piece.post_type || undefined}
      />

      {/* ═══════════════════════════════════════════════════════════
          PRINT FOOTER — Professional report footer
          ═══════════════════════════════════════════════════════════ */}
      <div className="hidden print:block">
        <div className="border-t-2 border-gray-200 pt-4 mt-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600">
                Regulatory Compliance Report
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {company?.name} | {frameworkLabels[framework] || framework} | Score: {review?.overallScore ?? "N/A"}/100
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400">
                Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-[10px] text-gray-400">
                Report ID: {pieceId.slice(0, 8)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-gray-500">AGENCY</span>
              <span className="text-[9px] text-gray-400">Content Platform</span>
            </div>
            <p className="text-[9px] text-gray-400 italic">
              This report is generated by automated compliance analysis and should be reviewed by qualified regulatory personnel before final approval.
            </p>
          </div>
        </div>
      </div>

      {/* Highlighting Legend — visible in print */}
      <div className="hidden print:block rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">Highlighting Key</p>
        <div className="flex items-center gap-6 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-8 rounded bg-red-100 border border-red-200" />
            <span className="text-gray-600">Legal concern</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-8 rounded bg-amber-100 border border-amber-200" />
            <span className="text-gray-600">Regulatory concern</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-8 rounded bg-blue-100 border border-blue-200" />
            <span className="text-gray-600">Compliance concern</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-8 rounded bg-green-50 border border-green-200" />
            <span className="text-gray-600">Clean / Approved</span>
          </span>
        </div>
      </div>
    </div>
  );
}
