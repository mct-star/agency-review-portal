import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSignedInProfile, requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { THREADS_NONCE_COOKIE, threadsConfig, threadsRequest, verifyThreadsState, type ThreadsToken } from "@/lib/threads/oauth";

/** Validates the signed Threads grant and saves the selected user's account to their company. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const nonce = jar.get(THREADS_NONCE_COOKIE)?.value;
  const secret = process.env.THREADS_APP_SECRET?.trim() || "";
  const state = verifyThreadsState(url.searchParams.get("state"), nonce, secret);
  const returnTo = (error: string) => `${url.origin}/publish${state?.companyId ? `?companyId=${encodeURIComponent(state.companyId)}&threads_error=${encodeURIComponent(error)}` : `?threads_error=${encodeURIComponent(error)}`}`;
  const clearNonce = (response: NextResponse) => response.cookies.set(THREADS_NONCE_COOKIE, "", { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/threads", maxAge: 0 });
  const fail = (error: string) => { const response = NextResponse.redirect(returnTo(error)); clearNonce(response); return response; };
  if (!state) return fail("invalid_state");
  const profile = await getSignedInProfile();
  const companyUser = await requireCompanyUser(state.companyId);
  if (!profile || profile.id !== state.userId || profile.role !== "admin" || !companyUser || companyUser.role !== "admin") return fail("not_authorised");
  if (url.searchParams.has("error") || !url.searchParams.get("code")) return fail("grant_cancelled");
  const config = threadsConfig();
  if (!config) return fail("not_configured");

  try {
    const shortResponse = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, code: url.searchParams.get("code")!, grant_type: "authorization_code", redirect_uri: config.redirectUri }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const short = await shortResponse.json().catch(() => null) as ThreadsToken | null;
    if (!shortResponse.ok || !short || typeof short.access_token !== "string") return fail("grant_invalid");

    const longUrl = new URL("https://graph.threads.net/access_token");
    longUrl.searchParams.set("grant_type", "th_exchange_token");
    longUrl.searchParams.set("client_secret", config.appSecret);
    const longResponse = await fetch(longUrl, { headers: { authorization: `Bearer ${short.access_token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const token = await longResponse.json().catch(() => null) as ThreadsToken | null;
    if (!longResponse.ok || !token || typeof token.access_token !== "string" || !Number.isFinite(token.expires_in) || !token.expires_in) return fail("grant_invalid");
    const identity = await threadsRequest("me", token.access_token, { fields: "id,username" });
    if (typeof identity.id !== "string" || typeof identity.username !== "string" || (token.user_id && token.user_id !== identity.id)) return fail("grant_invalid");
    // The documented publishing quota endpoint requires content publishing access, validating that scope before replacing a live grant.
    await threadsRequest("me/threads_publishing_limit", token.access_token, { fields: "quota_usage,config" });

    const supabase = await createAdminSupabaseClient();
    const { error } = await supabase.from("company_social_accounts").upsert({
      company_id: state.companyId,
      platform: "threads",
      account_name: identity.username,
      account_id: identity.id,
      access_token_encrypted: encrypt(token.access_token),
      refresh_token_encrypted: null,
      token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      platform_metadata: { username: identity.username, auth_method: "threads_oauth" },
      is_active: true,
    }, { onConflict: "company_id,platform,account_id" });
    if (error) return fail("save_failed");
    const response = NextResponse.redirect(`${url.origin}/publish?companyId=${encodeURIComponent(state.companyId)}&threads_connected=1`);
    clearNonce(response);
    return response;
  } catch {
    return fail("grant_invalid");
  }
}
