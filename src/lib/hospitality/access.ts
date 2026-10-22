import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany, type AccessProfile } from "@/lib/auth/permissions";
import type { Refusal } from "@/lib/media/access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PieceRow {
  id: string;
  company_id: string;
  week_id: string;
  approval_status: string;
  auto_source: string | null;
  post_type: string | null;
}

/**
 * A content piece, only if the caller belongs to its company. Another
 * company's piece answers 404, the same as one that does not exist.
 */
export async function authorisePiece(
  id: string
): Promise<({ ok: true; profile: AccessProfile & Record<string, unknown>; piece: PieceRow } | Refusal)> {
  const profile = await getSignedInProfile();
  if (!profile) return { ok: false, status: 401, error: "Unauthorized" };
  if (!UUID_RE.test(id)) return { ok: false, status: 400, error: "Invalid id" };
  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase
    .from("content_pieces")
    .select("id, company_id, week_id, approval_status, auto_source, post_type")
    .eq("id", id)
    .maybeSingle();
  const piece = data as PieceRow | null;
  if (!piece || !canAccessCompany(profile, piece.company_id)) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, profile, piece };
}
