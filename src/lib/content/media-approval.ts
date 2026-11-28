import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePieceMedia, type PieceMedia } from "@/lib/content/piece-media";

/**
 * Approval covers an uploaded PDF (28 Nov 2026).
 *
 * The text hash (version-hash.ts) is shared with the Mac gate and cannot
 * change, so an uploaded PDF is pinned separately: the approval records
 * media_hash (sha256 of the PDF's address) and the gate refuses a document
 * post whose PDF is not the one approved. Only document posts carry a
 * media_hash, so every existing approval of a text or image piece stays valid.
 */

/** The identity of a document post's PDF, or null when the piece is not a document post. */
export function documentMediaHash(media: PieceMedia): string | null {
  if (media.shape !== "document" || !media.items[0]?.url) return null;
  return createHash("sha256").update(`document:${media.items[0].url}`, "utf8").digest("hex");
}

/** Document hashes for a company's pieces. Null when they could not be read, so callers refuse rather than guess. */
export async function loadDocumentHashes(
  supabase: SupabaseClient,
  companyId: string,
  pieceIds: string[],
): Promise<Map<string, string | null> | null> {
  const out = new Map<string, string | null>();
  if (!pieceIds.length) return out;
  const [pieces, images, assets] = await Promise.all([
    supabase.from("content_pieces").select("id, title, cover_image_url").eq("company_id", companyId).in("id", pieceIds),
    supabase.from("content_images").select("content_piece_id, public_url, filename, sort_order, dimensions").in("content_piece_id", pieceIds),
    supabase.from("content_assets").select("content_piece_id, asset_type, file_url, text_content, asset_metadata").in("content_piece_id", pieceIds).not("file_url", "is", null),
  ]);
  if (pieces.error || images.error || assets.error) return null;
  for (const piece of pieces.data || []) {
    const media = resolvePieceMedia(
      piece as { title?: string | null; cover_image_url?: string | null },
      (images.data || []).filter((i) => i.content_piece_id === piece.id),
      (assets.data || []).filter((a) => a.content_piece_id === piece.id),
    );
    out.set(piece.id as string, documentMediaHash(media));
  }
  return out;
}
