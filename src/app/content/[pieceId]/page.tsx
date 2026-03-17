import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import ContentViewTabs from "@/components/content/ContentViewTabs";
import ApprovalButtons from "@/components/content/ApprovalButtons";
import CommentThread from "@/components/comments/CommentThread";
import CommentForm from "@/components/comments/CommentForm";
import ContentAssets from "@/components/content/ContentAssets";
import PlatformVariants from "@/components/content/PlatformVariants";
import GenerateActions from "@/components/content/GenerateActions";
import LinkedInPublishButton from "@/components/content/LinkedInPublishButton";
import type { Comment, ContentImage, User } from "@/types/database";

interface PageProps {
  params: Promise<{ pieceId: string }>;
}

const contentTypeLabels: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
};

export default async function ContentPiecePage({ params }: PageProps) {
  const { pieceId } = await params;
  const profile = await getUserProfile();
  if (!profile) return null; // Layout handles the "no profile" state

  const supabase = await createServerSupabaseClient();

  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*, week:weeks(*)")
    .eq("id", pieceId)
    .single();

  if (!piece) notFound();

  const { data: images } = await supabase
    .from("content_images")
    .select("*")
    .eq("content_piece_id", pieceId)
    .order("sort_order", { ascending: true });

  const { data: comments } = await supabase
    .from("comments")
    .select("*, user:users(*)")
    .eq("content_piece_id", pieceId)
    .order("created_at", { ascending: true });

  // Fetch company data for LinkedIn preview (spokesperson name, brand color)
  const { data: company } = await supabase
    .from("companies")
    .select("spokesperson_name, brand_color")
    .eq("id", piece.company_id)
    .single();

  // Find the first generated image for preview (if any)
  const previewImageUrl = (images && images.length > 0) ? images[0].public_url : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/weeks" className="hover:text-gray-700">
          Weeks
        </Link>
        <span>/</span>
        <Link
          href={`/weeks/${piece.week_id}`}
          className="hover:text-gray-700"
        >
          Week {piece.week?.week_number}
        </Link>
        <span>/</span>
        <span className="text-gray-900">{piece.title}</span>
      </div>

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium uppercase text-gray-400">
              {contentTypeLabels[piece.content_type]}
            </span>
            <h1 className="mt-1 text-xl font-bold text-gray-900">
              {piece.title}
            </h1>
          </div>
          <Badge status={piece.approval_status} />
        </div>

        {/* Metadata */}
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-500">
          {piece.day_of_week && (
            <span>{piece.day_of_week}</span>
          )}
          {piece.scheduled_time && (
            <span>{piece.scheduled_time}</span>
          )}
          {piece.word_count && (
            <span>{piece.word_count.toLocaleString()} words</span>
          )}
          {piece.pillar && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
              {piece.pillar}
            </span>
          )}
          {piece.audience_theme && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
              Theme: {piece.audience_theme}
            </span>
          )}
          {piece.topic_bank_ref && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
              {piece.topic_bank_ref}
            </span>
          )}
          {piece.post_type && (
            <span className="text-gray-400">{piece.post_type}</span>
          )}
        </div>
      </div>

      {/* Content Body + LinkedIn Preview (tabbed) */}
      <ContentViewTabs
        markdownBody={piece.markdown_body}
        firstComment={piece.first_comment}
        contentType={piece.content_type}
        authorName={company?.spokesperson_name || "Author"}
        authorTagline="Healthcare Demand Generation"
        brandColor={company?.brand_color || "#0a66c2"}
        postType={piece.post_type}
        imageUrl={previewImageUrl}
      />

      {/* Images */}
      {(images || []).length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Associated Images
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {(images || []).map((img: ContentImage) => (
              <div key={img.id} className="space-y-1">
                <img
                  src={img.public_url}
                  alt={img.filename}
                  className="rounded-lg border border-gray-200"
                />
                <p className="text-xs text-gray-500">{img.filename}</p>
                {img.archetype && (
                  <p className="text-xs text-gray-400">{img.archetype}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Assets */}
      <ContentAssets
        pieceId={piece.id}
        isAdmin={profile.role === "admin"}
      />

      {/* Platform Variants (only for social posts) */}
      {(piece.content_type === "social_post" ||
        piece.content_type === "linkedin_article") && (
        <PlatformVariants
          pieceId={piece.id}
          isAdmin={profile.role === "admin"}
        />
      )}

      {/* Generate Actions (admin only) */}
      <GenerateActions
        pieceId={piece.id}
        companyId={piece.company_id}
        contentType={piece.content_type}
        isAdmin={profile.role === "admin"}
      />

      {/* LinkedIn Publish (admin only, social posts only) */}
      {profile.role === "admin" && piece.content_type === "social_post" && (
        <LinkedInPublishButton
          pieceId={piece.id}
          companyId={piece.company_id}
          isApproved={piece.approval_status === "approved"}
        />
      )}

      {/* Approval Actions */}
      <ApprovalButtons
        pieceId={piece.id}
        weekId={piece.week_id}
        currentStatus={piece.approval_status}
      />

      {/* Comments */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">
          Comments ({(comments || []).length})
        </h3>
        <CommentThread comments={(comments || []) as (Comment & { user: User })[]} />
        <CommentForm pieceId={piece.id} weekId={piece.week_id} />
      </div>
    </div>
  );
}
