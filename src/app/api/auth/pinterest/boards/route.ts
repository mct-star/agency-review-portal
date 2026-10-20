import { NextRequest, NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { createAdminSupabaseClient, requireCompanyUser } from "@/lib/supabase/admin";
import { getPinterestIdentity, listPinterestBoards, pinterestClientId, pinterestClientSecret, refreshPinterestGrant } from "@/lib/pinterest/oauth";

/** Lists boards accessible to one active Pinterest connection, scoped to the specified company and social account row. */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || "";
  const socialAccountId = request.nextUrl.searchParams.get("socialAccountId") || "";
  if (!companyId || !socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });
  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });

  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts")
    .select("id,company_id,account_id,access_token_encrypted,refresh_token_encrypted,token_expires_at,is_active,platform_metadata")
    .eq("id", socialAccountId).eq("company_id", companyId).eq("platform", "pinterest").eq("is_active", true).maybeSingle();
  const expiry = account?.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
  if (!account?.access_token_encrypted || !Number.isFinite(expiry)) {
    return NextResponse.json({ error: "The selected Pinterest connection needs reconnecting" }, { status: 409 });
  }

  try {
    let accessToken = decrypt(account.access_token_encrypted);
    if (expiry <= Date.now() + 120_000) {
      if (!account.refresh_token_encrypted || !pinterestClientId() || !pinterestClientSecret()) return NextResponse.json({ error: "The selected Pinterest connection needs reconnecting" }, { status: 409 });
      const fresh = await refreshPinterestGrant(decrypt(account.refresh_token_encrypted), pinterestClientId(), pinterestClientSecret());
      const identity = await getPinterestIdentity(fresh.accessToken);
      if (identity.username.toLowerCase() !== account.account_id?.toLowerCase()) return NextResponse.json({ error: "The Pinterest identity changed. Reconnect this account." }, { status: 409 });
      const { data: saved, error } = await supabase.from("company_social_accounts").update({
        access_token_encrypted: encrypt(fresh.accessToken), refresh_token_encrypted: encrypt(fresh.refreshToken), token_expires_at: fresh.expiresAt,
        platform_metadata: { ...(account.platform_metadata || {}), scope: fresh.scope, refreshTokenExpiresAt: fresh.refreshTokenExpiresAt },
      }).eq("id", socialAccountId).eq("company_id", companyId).eq("platform", "pinterest").eq("is_active", true)
        .eq("refresh_token_encrypted", account.refresh_token_encrypted).select("id").maybeSingle();
      if (error || !saved) return NextResponse.json({ error: "The connection changed while refreshing. Reload the account list." }, { status: 409 });
      accessToken = fresh.accessToken;
    }
    const boards = await listPinterestBoards(accessToken);
    return NextResponse.json({ boards: boards.map(({ id, name }) => ({ id, name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Pinterest boards could not be loaded. Reconnect the account if the access has expired." }, { status: 502 });
  }
}
