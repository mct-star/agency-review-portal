import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDocumentHashes } from "@/lib/content/media-approval";

/**
 * The version of a piece that a recorded approval refers to.
 *
 * sha256 hex of title, NUL, markdown_body, NUL, first_comment (empty when
 * null), UTF-8. The Mac's Phase B2 gate (content_approval_gate.py in the
 * agency-workforce plugin) computes the same value and refuses to publish
 * unless the newest content_approvals row carries it. Change both or
 * neither: version-hash.test.ts and test_content_approval_gate.py pin the
 * same digest.
 */
export function pieceVersionHash(piece: {
  title?: string | null;
  markdown_body?: string | null;
  first_comment?: string | null;
}): string {
  const raw = [piece.title ?? "", piece.markdown_body ?? "", piece.first_comment ?? ""].join("\u0000");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type ApprovalDecision = "approved" | "changes_requested";
export type ApprovalVia = "review" | "bulk_review" | "ops_bridge";

export interface ApprovablePiece {
  id: string;
  company_id: string;
  title: string | null;
  markdown_body: string | null;
  first_comment: string | null;
}

/** Columns a caller must select before recording a decision. */
export const APPROVABLE_COLUMNS = "id, company_id, title, markdown_body, first_comment";

/**
 * Append one content_approvals row per piece for this decision. Returns the
 * error message, or null. Callers record BEFORE they change
 * approval_status, so a status of approved never exists without its row.
 */
export async function recordDecisions(
  supabase: SupabaseClient,
  pieces: ApprovablePiece[],
  decision: ApprovalDecision,
  decidedBy: string,
  via: ApprovalVia,
  note?: string | null,
): Promise<string | null> {
  if (!pieces.length) return null;
  if (!decidedBy) return "A decision needs the person who made it.";
  // A document post's approval also records which PDF was approved. Other pieces carry none.
  // If the media cannot be read, the approval is still recorded without a PDF hash: the publish gate then refuses that document post until it is approved again, so this never lets a swapped PDF through.
  const documentHashes = decision === "approved"
    ? await loadDocumentHashes(supabase, pieces[0].company_id, pieces.map((p) => p.id)).catch(() => null) ?? new Map<string, string | null>()
    : new Map<string, string | null>();
  const rows = pieces.map((p) => ({
    piece_id: p.id,
    company_id: p.company_id,
    version_hash: pieceVersionHash(p),
    decision,
    decided_by: decidedBy,
    decided_via: via,
    note: note ?? null,
    ...(documentHashes.get(p.id) ? { media_hash: documentHashes.get(p.id) } : {}),
  }));
  const { error } = await supabase.from("content_approvals").insert(rows);
  return error ? error.message : null;
}
