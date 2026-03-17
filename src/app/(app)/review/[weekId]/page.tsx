import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import WeekReviewTabs from "@/components/content/WeekReviewTabs";
import MetricoolExportButton from "@/components/weeks/MetricoolExportButton";
import type { Company, ContentPiece, ContentImage, ContentAsset } from "@/types/database";

interface PageProps {
  params: Promise<{ weekId: string }>;
}

export default async function WeekReviewPage({ params }: PageProps) {
  const { weekId } = await params;
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();

  // Fetch week with company data
  const { data: week } = await supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .eq("id", weekId)
    .single();

  if (!week) notFound();

  const company = week.company as Company;

  // Fetch content pieces first, then batch-fetch their images and assets
  const { data: piecesData } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    .order("sort_order", { ascending: true });

  const pieces = (piecesData || []) as ContentPiece[];
  const pieceIds = pieces.map((p) => p.id);

  const [imagesForPieces, assetsForPieces] = await Promise.all([
    supabase
      .from("content_images")
      .select("*")
      .in("content_piece_id", pieceIds.length > 0 ? pieceIds : ["__none__"])
      .order("sort_order", { ascending: true }),
    supabase
      .from("content_assets")
      .select("*")
      .in("content_piece_id", pieceIds.length > 0 ? pieceIds : ["__none__"])
      .order("sort_order", { ascending: true }),
  ]);

  const imagesByPiece = new Map<string, ContentImage[]>();
  for (const img of (imagesForPieces.data || []) as ContentImage[]) {
    const existing = imagesByPiece.get(img.content_piece_id) || [];
    existing.push(img);
    imagesByPiece.set(img.content_piece_id, existing);
  }

  const assetsByPiece = new Map<string, ContentAsset[]>();
  for (const asset of (assetsForPieces.data || []) as ContentAsset[]) {
    const existing = assetsByPiece.get(asset.content_piece_id) || [];
    existing.push(asset);
    assetsByPiece.set(asset.content_piece_id, existing);
  }

  // Enrich pieces with their images and assets
  const enrichedPieces = pieces.map((p) => ({
    ...p,
    images: imagesByPiece.get(p.id) || [],
    assets: assetsByPiece.get(p.id) || [],
  }));

  // Group by content type
  const socialPieces = enrichedPieces.filter((p) => p.content_type === "social_post");
  const blogPieces = enrichedPieces.filter((p) => p.content_type === "blog_article");
  const articlePieces = enrichedPieces.filter((p) => p.content_type === "linkedin_article");

  // Progress stats
  const totalPieces = pieces.length;
  const approvedCount = pieces.filter((p) => p.approval_status === "approved").length;
  const changesCount = pieces.filter((p) => p.approval_status === "changes_requested").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/review" className="hover:text-gray-700">
          Weeks
        </Link>
        <span>/</span>
        <Link href={`/review/${weekId}`} className="hover:text-gray-700">
          Week {week.week_number}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Review</span>
      </div>

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                Week {week.week_number} Review
              </h1>
              <Badge status={week.status} />
            </div>
            {week.title && (
              <p className="mt-1 text-gray-600">{week.title}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {week.date_start} — {week.date_end}
              <span className="ml-2 text-gray-400">| {company.name}</span>
            </p>
            {week.pillar && (
              <div className="mt-2 flex gap-1">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  Pillar: {week.pillar}
                </span>
                {week.theme && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    Theme: {week.theme}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {socialPieces.length > 0 && (
              <MetricoolExportButton
                weekId={weekId}
                draft={approvedCount < totalPieces}
              />
            )}
            <Link
              href={`/review/${weekId}`}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Week Detail
            </Link>
          </div>
        </div>

        {/* Progress bar */}
        {totalPieces > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {approvedCount}/{totalPieces} approved
              </span>
              {changesCount > 0 && (
                <span className="text-amber-600">
                  {changesCount} need changes
                </span>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{
                  width: `${totalPieces ? (approvedCount / totalPieces) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabbed content */}
      <WeekReviewTabs
        socialPieces={socialPieces}
        blogPieces={blogPieces}
        articlePieces={articlePieces}
        allPieces={enrichedPieces}
        authorName={company.spokesperson_name || "Author"}
        authorTagline={company.spokesperson_tagline || "Healthcare Demand Generation"}
        brandColor={company.brand_color || "#0a66c2"}
      />
    </div>
  );
}
