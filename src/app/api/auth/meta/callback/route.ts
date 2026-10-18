import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSignedInProfile, requireCompanyUser } from "@/lib/supabase/admin";
import { encryptJson } from "@/lib/crypto";
import { hasMetaPermissions, metaConfig, META_NONCE_COOKIE, META_PENDING_COOKIE, metaGraph, verifyMetaState } from "@/lib/meta/oauth";

/** Validates the Meta grant and holds it in a short-lived encrypted browser cookie until a Page is selected. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const nonce = jar.get(META_NONCE_COOKIE)?.value;
  const state = verifyMetaState(url.searchParams.get("state"), nonce);
  const origin = url.origin;
  const returnTo = (key: string) => `${origin}/publish?companyId=${encodeURIComponent(state?.companyId || "")}&meta_error=${key}`;
  const expireCookie = (response: NextResponse, name: string) => response.cookies.set(name, "", { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/meta", maxAge: 0 });
  const error = (key: string) => {
    const response = NextResponse.redirect(returnTo(key));
    expireCookie(response, META_NONCE_COOKIE); expireCookie(response, META_PENDING_COOKIE);
    return response;
  };
  const profile = await getSignedInProfile();
  if (!state || !profile || profile.id !== state.userId) return error("invalid_session");
  const companyUser = await requireCompanyUser(state.companyId);
  if (!companyUser || (companyUser.role !== "admin" && !companyUser.can_publish)) return error("not_authorised");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) return error("grant_cancelled");
  const config = metaConfig();
  if (!config) return error("not_configured");
  try {
    const tokenUrl = `https://graph.facebook.com/${config.version}/oauth/access_token`;
    const exchange = async (params: Record<string, string>) => fetch(tokenUrl, { method: "POST", body: new URLSearchParams(params), headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(12_000), redirect: "error", cache: "no-store" });
    const shortResponse = await exchange({ client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.redirectUri, code });
    const shortToken = await shortResponse.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
    if (!shortResponse.ok || !shortToken?.access_token) return error("grant_invalid");
    const longResponse = await exchange({ grant_type: "fb_exchange_token", client_id: config.appId, client_secret: config.appSecret, fb_exchange_token: shortToken.access_token });
    const tokenData = await longResponse.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
    if (!longResponse.ok || !tokenData?.access_token || !Number.isFinite(tokenData.expires_in) || !tokenData.expires_in) return error("grant_invalid");
    const grants = await metaGraph("me/permissions", { fields: "permission,status" }, tokenData.access_token);
    const permissions = Array.isArray(grants.data) ? grants.data as Array<{ permission?: string; status?: string }> : [];
    if (!hasMetaPermissions(permissions)) return error("permissions_missing");
    const encrypted = encryptJson({ companyId: state.companyId, userId: state.userId, accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(), grantExpiresAt: Date.now() + 10 * 60_000, nonce: state.nonce });
    const result = NextResponse.redirect(`${origin}/publish?companyId=${encodeURIComponent(state.companyId)}&meta_choose_page=1`);
    result.cookies.set(META_PENDING_COOKIE, encrypted, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/meta", maxAge: 600 });
    expireCookie(result, META_NONCE_COOKIE);
    return result;
  } catch {
    return error("grant_invalid");
  }
}
