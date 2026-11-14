import { randomUUID } from "crypto";
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURE_GRANT_MAX_USES, CAPTURE_LINK_TTL_SECONDS, captureLinkSecret, signCaptureGrant, verifyCaptureGrant } from "./token";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export type CaptureResolution =
  | { ok: true; pieceId: string; folder: string; grantId: string; useCount: number }
  | { ok: false; status: number; error: string };

const REFUSED = { ok: false as const, status: 403, error: "This recording link has expired or is not valid. Ask for a new one." };

/**
 * Check a capture grant against the company the staff link belongs to and
 * against the stored grant row (`capture_grants`). The signature must verify
 * with the dedicated secret, name this company, and the stored row must exist
 * for the same company and piece, be unexpired, not withdrawn and under its
 * use cap. Only then is the piece read, and it must belong to this company.
 * Nothing is read or written for the piece until all of that holds.
 *
 * This only checks. The use is counted by `consumeCaptureGrantUse`, called
 * by the one route that stores a video.
 *
 * It fails closed: while the `capture_grants` table does not exist (migration
 * not yet applied) the lookup errors and the link is refused, never trusted.
 */
export async function resolveCaptureGrant(
  supabase: SupabaseAdmin,
  companyId: string,
  grant: unknown,
  now = Date.now()
): Promise<CaptureResolution> {
  const parsed = verifyCaptureGrant(grant, captureLinkSecret(), now);
  if (!parsed || parsed.companyId !== companyId) return REFUSED;

  const { data: row, error: grantError } = await supabase
    .from("capture_grants")
    .select("id, company_id, content_piece_id, expires_at, use_count, max_uses, revoked")
    .eq("id", parsed.grantId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (grantError) {
    return { ok: false, status: 503, error: "Recording links are not available at the moment. Please try again later." };
  }
  const stored = row as {
    id: string;
    company_id: string;
    content_piece_id: string;
    expires_at: string;
    use_count: number;
    max_uses: number;
    revoked: boolean;
  } | null;
  if (!stored || stored.company_id !== companyId || stored.content_piece_id !== parsed.pieceId) return REFUSED;
  if (stored.revoked) return REFUSED;
  const expires = Date.parse(stored.expires_at);
  if (!Number.isFinite(expires) || expires <= now) return REFUSED;
  if (!Number.isInteger(stored.use_count) || !Number.isInteger(stored.max_uses) || stored.use_count >= stored.max_uses) {
    return { ok: false, status: 403, error: "This recording link has already been used the maximum number of times. Ask for a new one." };
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
  return { ok: true, pieceId: piece.id as string, folder: `${companyId}/capture/${piece.id}/`, grantId: stored.id, useCount: stored.use_count };
}

/**
 * Count one use of a grant. A compare-and-swap on the use count, so two
 * uploads racing for the last place cannot both win: the loser's update
 * matches no row and the caller refuses. Returns false when the use was not
 * counted (cap reached, withdrawn, expired, or the table is unavailable).
 */
export async function consumeCaptureGrantUse(
  supabase: SupabaseAdmin,
  companyId: string,
  resolved: { grantId: string; useCount: number },
  now = Date.now()
): Promise<boolean> {
  const { data, error } = await supabase
    .from("capture_grants")
    .update({ use_count: resolved.useCount + 1 })
    .eq("id", resolved.grantId)
    .eq("company_id", companyId)
    .eq("use_count", resolved.useCount)
    .eq("revoked", false)
    .gt("expires_at", new Date(now).toISOString())
    .lt("use_count", CAPTURE_GRANT_MAX_USES)
    .select("id");
  return !error && Array.isArray(data) && data.length === 1;
}

export type MintResult = { ok: true; grant: string; expiresAt: string } | { ok: false; status: number; error: string };

/**
 * Store a new grant for one planned piece and return the signed link value.
 * The caller must already have authorised the user for `companyId`
 * (`authoriseChannelManager` or `requireCompanyUser`); this still checks the
 * piece belongs to that company. Refuses when CAPTURE_LINK_SECRET is not set.
 * Not called by any route yet.
 */
export async function mintCaptureGrant(
  supabase: SupabaseAdmin,
  input: { companyId: string; pieceId: string; createdBy?: string | null },
  now = Date.now()
): Promise<MintResult> {
  const secret = captureLinkSecret();
  if (!secret) return { ok: false, status: 503, error: "Recording links are switched off." };
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, company_id")
    .eq("id", input.pieceId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!piece || piece.company_id !== input.companyId) return { ok: false, status: 404, error: "That piece could not be found." };

  const grantId = randomUUID();
  const expiresAt = new Date(now + CAPTURE_LINK_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabase.from("capture_grants").insert({
    id: grantId,
    company_id: input.companyId,
    content_piece_id: input.pieceId,
    expires_at: expiresAt,
    max_uses: CAPTURE_GRANT_MAX_USES,
    created_by: input.createdBy ?? null,
  });
  if (error) return { ok: false, status: 503, error: "Recording links are not available at the moment. Please try again later." };
  return { ok: true, grant: signCaptureGrant({ companyId: input.companyId, pieceId: input.pieceId, grantId }, secret, now), expiresAt };
}

/** Withdraw a grant (or every open grant for a piece) so its link stops working at once. */
export async function revokeCaptureGrants(
  supabase: SupabaseAdmin,
  companyId: string,
  target: { grantId?: string; pieceId?: string }
): Promise<boolean> {
  if (!target.grantId && !target.pieceId) return false;
  let query = supabase.from("capture_grants").update({ revoked: true }).eq("company_id", companyId);
  if (target.grantId) query = query.eq("id", target.grantId);
  if (target.pieceId) query = query.eq("content_piece_id", target.pieceId);
  const { error } = await query;
  return !error;
}
