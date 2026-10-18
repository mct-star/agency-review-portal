import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { exchangeXCode, getXIdentity, verifyXState, X_STATE_COOKIE, xClientId, xClientSecret, xRedirectUri } from "@/lib/x/oauth";

function cookieValue(request: NextRequest, name: string) {
  return request.cookies.get(name)?.value || "";
}

/** Completes X authorisation only in the same admin browser that started it, then validates identity before saving encrypted tokens. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const clientId = xClientId();
  const secret = xClientSecret();
  const redirectUri = xRedirectUri(origin);
  const state = verifyXState(searchParams.get("state"), secret);
  const pending = cookieValue(request, X_STATE_COOKIE).split(".");
  const returnBase = new URL(redirectUri).origin;
  const returnUrl = (query: string) => state
    ? new URL(state.returnTo === "publish" ? `/publish?companyId=${encodeURIComponent(state.companyId)}&${query}` : `/setup/${state.companyId}/social?${query}`, returnBase)
    : new URL(`/setup?${query}`, returnBase);
  const responseFor = (query: string) => {
    const response = NextResponse.redirect(returnUrl(query));
    response.cookies.set(X_STATE_COOKIE, "", { httpOnly: true, secure: new URL(redirectUri).protocol === "https:", sameSite: "lax", path: "/api/auth/x/callback", maxAge: 0 });
    return response;
  };

  if (!state || pending.length !== 2 || pending[0] !== state.nonce || !pending[1]) return responseFor("x_error=invalid_state");
  const admin = await requireAdmin();
  if (!admin || admin.id !== state.userId) return responseFor("x_error=admin_session_required");
  const providerError = searchParams.get("error");
  if (providerError) return responseFor("x_error=authorisation_declined");
  const code = searchParams.get("code");
  if (!code || !clientId || !secret) return responseFor("x_error=missing_parameters");

  try {
    const grant = await exchangeXCode(code, pending[1], clientId, redirectUri, secret);
    const identity = await getXIdentity(grant.accessToken);
    const supabase = await createAdminSupabaseClient();
    const { error } = await supabase.from("company_social_accounts").upsert({
      company_id: state.companyId,
      platform: "twitter",
      account_name: identity.name,
      account_id: identity.id,
      access_token_encrypted: encrypt(grant.accessToken),
      refresh_token_encrypted: encrypt(grant.refreshToken),
      token_expires_at: grant.expiresAt,
      platform_metadata: { username: identity.username, scope: grant.scope, provider: "x-api-v2" },
      is_active: true,
    }, { onConflict: "company_id,platform,account_id" });
    if (error) {
      console.error("[X OAuth] account save failed:", error.message);
      return responseFor("x_error=connection_save_failed");
    }
    return responseFor("x_connected=1");
  } catch {
    console.error("[X OAuth] authorisation or account validation failed");
    return responseFor("x_error=connection_validation_failed");
  }
}
