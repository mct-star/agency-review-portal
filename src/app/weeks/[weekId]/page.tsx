import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { ContentPiece, Company } from "@/types/database";
import PublishButton from "@/components/weeks/PublishButton";

interface PageProps {
  params: Promise<{ weekId: string }>;
}

const contentTypeLabels: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
};

const contentTypeColors: Record<string, string> = {
  social_post: "border-l-sky-400",
  blog_article: "border-l-purple-400",
  linkedin_article: "border-l-blue-400",
  pdf_guide: "border-l-orange-400",
};

export default async function WeekDetailPage({ params }: PageProps) {
  const { weekId } = await params;
  const profile = await getUserProfile();
  if (!profile) return null; // Layout handles the "no profile" state

  const supabase = await createServerSupabaseClient();

  const { data: week } = await supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .eq("id", weekId)
    .single();

  if (!week) notFound();

  const { data: pieces } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    .order("sort_order", { ascending: true });

  const isAdmin = profile.role === "admin";
  const totalPieces = (pieces || []).length;
  const approvedCount = (pieces || []).filter(
    (p: ContentPiece) => p.approval_status === "approved"
  ).length;
  const changesCount = (pieces || []).filter(
    (p: ContentPiece) => p.approval_status === "changes_requested"
  ).length;

  // Group pieces: anchor content vs social posts
  const anchorPieces = (pieces || []).filter(
    (p: ContentPiece) => p.content_type !== "social_post"
  );
  const socialPieces = (pieces || []).filter(
    (p: ContentPiece) => p.content_type === "social_post"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Week {week.week_number}
            </h1>
            <Badge status={week.status} />
          </div>
          {week.title && (
            <p className="mt-1 text-gray-600">{week.title}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {week.date_start} — {week.date_end}
            {isAdmin && week.company && (
              <span className="ml-2 text-gray-400">
                | {(week.company as Company).name}
              </span>
            )}
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

        {isAdmin && week.status === "draft" && (
          <PublishButton weekId={week.id} />
        )}
      </div>

      {/* Progress */}
      {totalPieces > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
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

      {/* Anchor Content */}
      {anchorPieces.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Anchor Content
          </h2>
          <div className="space-y-3">
            {anchorPieces.map((piece: ContentPiece) => (
              <Link
                key={piece.id}
                href={`/content/${piece.id}`}
                className={`block rounded-lg border border-gray-200 border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${contentTypeColors[piece.content_type]}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium uppercase text-gray-400">
                      {contentTypeLabels[piece.content_type]}
                    </span>
                    <h3 className="font-medium text-gray-900">{piece.title}</h3>
                    {piece.word_count && (
                      <p className="text-xs text-gray-500">
                        {piece.word_count.toLocaleString()} words
                      </p>
                    )}
                  </div>
                  <Badge status={piece.approval_status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Social Posts */}
      {socialPieces.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            LinkedIn Posts
          </h2>
          <div className="space-y-3">
            {socialPieces.map((piece: ContentPiece) => (
              <Link
                key={piece.id}
                href={`/content/${piece.id}`}
                className={`block rounded-lg border border-gray-200 border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${contentTypeColors[piece.content_type]}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {piece.day_of_week && (
                        <span className="text-xs font-medium uppercase text-gray-400">
                          {piece.day_of_week}
                        </span>
                      )}
                      {piece.scheduled_time && (
                        <span className="text-xs text-gray-400">
                          {piece.scheduled_time}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900">{piece.title}</h3>
                    {piece.post_type && (
                      <p className="text-xs text-gray-500">{piece.post_type}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {piece.pillar && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {piece.pillar}
                      </span>
                    )}
                    <Badge status={piece.approval_status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {totalPieces === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No content pieces in this week yet.</p>
        </div>
      )}
    </div>
  );
}
