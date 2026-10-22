import { NextResponse } from "next/server";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { revokeXToken, xClientId, xClientSecret } from "@/lib/x/oauth";

/** Disconnects one X connection for the named company, clears local credentials, and revokes the refresh grant when configured. */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { companyId?: unknown; id?: unknown } | null;
  if (typeof body?.companyId !== "string" || typeof body.id !== "string") {
    return NextResponse.json({ error: "companyId and id are required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts")
    .select("id,access_token_encrypted,refresh_token_encrypted")
    .eq("id", body.id).eq("company_id", body.companyId).eq("platform", "twitter").maybeSingle();
  if (!account) return NextResponse.json({ error: "X connection not found for this company" }, { status: 404 });

  const { data: saved, error } = await supabase.from("company_social_accounts").update({
    is_active: false,
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
  }).eq("id", body.id).eq("company_id", body.companyId).eq("platform", "twitter").select("id").maybeSingle();
  if (error || !saved) return NextResponse.json({ error: "The X connection could not be disconnected" }, { status: 500 });

  let providerRevoked = false;
  const clientId = xClientId();
  const clientSecret = xClientSecret();
  const encryptedToken = account.refresh_token_encrypted || account.access_token_encrypted;
  const tokenType = account.refresh_token_encrypted ? "refresh_token" : "access_token";
  if (clientId && encryptedToken) {
    try {
      await revokeXToken(decrypt(encryptedToken), clientId, clientSecret || undefined, tokenType);
      providerRevoked = true;
    } catch {
      console.error("[X OAuth] local disconnection succeeded; provider revocation did not complete");
    }
  }
  return NextResponse.json({ ok: true, providerRevoked });
}
