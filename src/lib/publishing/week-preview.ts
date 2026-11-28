import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { linkedInDirectMedia } from "@/lib/linkedin/direct-publish";
import { applyMentions, type MentionEntry } from "@/lib/linkedin/mentions";
import { toLinkedInText } from "@/lib/linkedin/post-text";
import type { DeploySocial } from "@/lib/publishing/deploy-week";

export interface WeekPreviewItem {
  pieceId: string;
  title: string;
  scheduledFor: string;
  account: string | null;
  /** The post as a reader sees it: the approved text, with a listed name left as written. */
  text: string;
  /** "none", "image", "carousel of N images", "PDF document", "video with thumbnail", or the refusal. */
  media: string;
  firstComment: string | null;
  /** Names after a ＠ that are not in the mention list: published as plain text. */
  warnings: string[];
  /** Names that will become real mentions. */
  mentions: string[];
}

interface PieceFields { id: string; content_type?: unknown; markdown_body?: unknown; first_comment?: unknown; title?: unknown; cover_image_url?: unknown }

/** One line saying what media a post carries, from the same resolver the publisher uses. */
export function describeMedia(contentType: string, media: ReturnType<typeof resolvePieceMedia>): string {
  const direct = linkedInDirectMedia(contentType, media);
  if ("error" in direct) return `Cannot be published: ${direct.error}`;
  if (direct.videoUrl) return "Video with thumbnail";
  if (direct.documentUrl) return "PDF document";
  if (direct.imageUrls.length > 1) return `Carousel of ${direct.imageUrls.length} images`;
  if (direct.imageUrls.length === 1) return "One image";
  return "Text only";
}

/** Each post that Deploy week would queue, as it will go out: time, account, text, media, first comment, warnings. Reads only. */
export async function linkedInPublishReview(
  supabase: SupabaseClient,
  companyId: string,
  toQueue: DeploySocial[],
  pieces: Map<string, PieceFields>,
  accountName: (item: DeploySocial) => string | null,
): Promise<WeekPreviewItem[]> {
  if (toQueue.length === 0) return [];
  const ids = toQueue.map((s) => s.pieceId);
  const [{ data: images }, { data: assets }, { data: mentionRows }] = await Promise.all([
    supabase.from("content_images").select("content_piece_id, public_url, filename, sort_order, dimensions").in("content_piece_id", ids),
    supabase.from("content_assets").select("content_piece_id, asset_type, file_url, text_content, asset_metadata").in("content_piece_id", ids).not("file_url", "is", null),
    supabase.from("linkedin_mentions").select("name, urn, kind").eq("company_id", companyId),
  ]);
  const list = (mentionRows || []) as MentionEntry[];
  return toQueue.map((s) => {
    const piece = pieces.get(s.pieceId) || { id: s.pieceId };
    const media = resolvePieceMedia(
      piece as { title?: string | null; cover_image_url?: string | null },
      (images || []).filter((i) => i.content_piece_id === s.pieceId),
      (assets || []).filter((a) => a.content_piece_id === s.pieceId),
    );
    const plain = toLinkedInText(String(piece.markdown_body || ""));
    const result = applyMentions(plain, list);
    return {
      pieceId: s.pieceId,
      title: s.title,
      scheduledFor: s.scheduledFor,
      account: accountName(s),
      text: plain,
      media: describeMedia(s.contentType, media),
      firstComment: piece.first_comment ? toLinkedInText(String(piece.first_comment)) : null,
      warnings: result.unknown,
      mentions: result.converted,
    };
  });
}
