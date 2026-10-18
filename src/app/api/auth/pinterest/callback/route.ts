import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { exchangePinterestCode, getPinterestIdentity, pinterestClientId, pinterestClientSecret, pinterestRedirectUri, verifyPinterestState, PINTEREST_STATE_COOKIE } from "@/lib/pinterest/oauth";

/** Completes Pinterest authorisation in the same admin browser, then validates the granted identity before encrypted storage. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const clientId = pinterestClientId();
  const secret = pinterestClientSecret();
  const redirectUri = pinterestRedirectUri(origin);
  const state = verifyPinterestState(searchParams.get("state"), secret);
  const pendingNonce = request.cookies.get(PINTEREST_STATE_COOKIE)?.value || "";
  const returnBase = new URL(redirectUri).origin;
  const returnUrl = (query: string) => state
    ? new URL(state.returnTo === "publish" ? `/publish?${query}` : `/setup/${state.companyId}/social?${query}`, returnBase)
    : new URL(`/setup?${query}`, returnBase);
  const responseFor = (query: string) => {
    const response = NextResponse.redirect(returnUrl(query));
    response.cookies.set(PINTEREST_STATE_COOKIE, "", { httpOnly: true, secure: new URL(redirectUri).protocol === "https:", sameSite: "lax", path: "/api/auth/pinterest/callback", maxAge: 0 });
    return response;
  };

  if (!state || !pendingNonce || pendingNonce !== state.nonce) return responseFor("pinterest_error=invalid_state");
  const admin = await requireAdmin();
  if (!admin || admin.id !== state.userId) return responseFor("pinterest_error=admin_session_required");
  if (searchParams.get("error")) return responseFor("pinterest_error=authorisation_declined");
  const code = searchParams.get("code");
  if (!code || !clientId || !secret) return responseFor("pinterest_error=missing_parameters");

  try {
    const grant = await exchangePinterestCode(code, clientId, secret, redirectUri);
    const identity = await getPinterestIdentity(grant.accessToken);
    const supabase = await createAdminSupabaseClient();
    const { error } = await supabase.from("company_social_accounts").upsert({
      company_id: state.companyId,
      platform: "pinterest",
      account_name: identity.username,
      account_id: identity.username,
      access_token_encrypted: encrypt(grant.accessToken),
      refresh_token_encrypted: encrypt(grant.refreshToken),
      token_expires_at: grant.expiresAt,
      platform_metadata: {
        username: identity.username,
        account_type: identity.accountType,
        profile_image: identity.profileImage,
        scope: grant.scope,
        refreshTokenExpiresAt: grant.refreshTokenExpiresAt,
        provider: "pinterest-api-v5",
      },
      is_active: true,
    }, { onConflict: "company_id,platform,account_id" });
    if (error) {
      console.error("[Pinterest OAuth] account save failed:", error.message);
      return responseFor("pinterest_error=connection_save_failed");
    }
    return responseFor("pinterest_connected=1");
  } catch {
    console.error("[Pinterest OAuth] authorisation or account validation failed");
    return responseFor("pinterest_error=connection_validation_failed");
  }
}
