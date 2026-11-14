import type { SupabaseClient } from "@supabase/supabase-js";
import { pieceVersionHash } from "@/lib/content/version-hash";

/**
 * The recorded-approval gate (14 Nov 2026): a piece is queued for direct
 * publishing only when its newest content_approvals row is an approval of
 * the exact text it carries now. approval_status alone is not enough:
 * editing a piece through PATCH /api/content/pieces does not reset it, so
 * an approved piece can carry text nobody approved.
 *
 * Fails closed: no row, a newest row that asked for changes, a hash that
 * does not match, or an unreadable record all refuse.
 */

export interface GatePiece {
  id: string;
  approval_status: string;
  title: string | null;
  markdown_body: string | null;
  first_comment: string | null;
}

export interface RecordedApproval {
  piece_id: string;
  version_hash: string;
  decision: string;
  decided_at: string;
}

/** Columns a caller selects on content_pieces before calling the gate. */
export const GATE_PIECE_COLUMNS = "id, approval_status, title, markdown_body, first_comment";

export const APPROVAL_REFUSALS = {
  notApproved: "It is not approved.",
  noRecord: "It has no recorded approval. Approve it again before publishing.",
  changesRequested: "Its newest decision asked for changes. Approve it before publishing.",
  edited: "It was edited after approval. Approve the current version before publishing.",
  unreadable: "Its approval record could not be checked, so it was not queued.",
} as const;

/** The plain reason a piece may not be queued, or null when it may. Pure. */
export function approvalRefusal(piece: GatePiece, newest: RecordedApproval | null | undefined): string | null {
  if (piece.approval_status !== "approved") return APPROVAL_REFUSALS.notApproved;
  if (!newest) return APPROVAL_REFUSALS.noRecord;
  if (newest.decision !== "approved") return APPROVAL_REFUSALS.changesRequested;
  if (newest.version_hash !== pieceVersionHash(piece)) return APPROVAL_REFUSALS.edited;
  return null;
}

/**
 * The newest recorded decision per piece, for one company's pieces only.
 * Returns null when the record could not be read (the caller refuses).
 */
export async function newestApprovals(
  supabase: SupabaseClient,
  companyId: string,
  pieceIds: string[],
): Promise<Map<string, RecordedApproval> | null> {
  const newest = new Map<string, RecordedApproval>();
  if (!pieceIds.length) return newest;
  const { data, error } = await supabase.from("content_approvals")
    .select("piece_id, version_hash, decision, decided_at")
    .eq("company_id", companyId).in("piece_id", pieceIds)
    .order("decided_at", { ascending: false });
  if (error) return null;
  for (const row of (data || []) as RecordedApproval[]) {
    const seen = newest.get(row.piece_id);
    if (!seen || Date.parse(row.decided_at) > Date.parse(seen.decided_at)) newest.set(row.piece_id, row);
  }
  return newest;
}

/** One piece through the gate: its refusal reason, or null when it may be queued. */
export async function recordedApprovalRefusal(
  supabase: SupabaseClient,
  companyId: string,
  piece: GatePiece,
): Promise<string | null> {
  const newest = await newestApprovals(supabase, companyId, [piece.id]);
  if (!newest) return APPROVAL_REFUSALS.unreadable;
  return approvalRefusal(piece, newest.get(piece.id));
}
