import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { captureLinkSecret, verifyCaptureGrant } from "./token";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export type CaptureResolution =
  | { ok: true; pieceId: string; folder: string }
  | { ok: false; status: number; error: string };

/**
 * Check a capture grant against the company the staff link belongs to and
 * against the database. The grant must verify and be unexpired, name this
 * company, and the piece must exist and belong to this company. Nothing is
 * read or written for the piece until all of that holds.
 */
export async function resolveCaptureGrant(supabase: SupabaseAdmin, companyId: string, grant: unknown): Promise<CaptureResolution> {
  const parsed = verifyCaptureGrant(grant, captureLinkSecret());
  if (!parsed || parsed.companyId !== companyId) {
    return { ok: false, status: 403, error: "This recording link has expired or is not valid. Ask for a new one." };
  }
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, company_id")
    .eq("id", parsed.pieceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!piece || piece.company_id !== companyId) {
    return { ok: false, status: 404, error: "That piece could not be found." };
  }
  return { ok: true, pieceId: piece.id as string, folder: `${companyId}/capture/${piece.id}/` };
}
