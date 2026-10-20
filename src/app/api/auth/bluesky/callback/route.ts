import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSignedInProfile, requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { BLUESKY_NONCE_COOKIE, blueskyOAuthConfig, createBlueskyOAuthClient, encodeBlueskySession, verifyBlueskyPendingState } from "@/lib/bluesky/oauth";

/** Completes Bluesky OAuth only for its initiating browser user, then stores the validated encrypted SDK session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const nonce = jar.get(BLUESKY_NONCE_COOKIE)?.value;
  const sdkState = url.searchParams.get("state");
  let state: ReturnType<typeof verifyBlueskyOAuthState> = null;
  const returnTo = (error: string) => `${url.origin}/publish${state?.companyId ? `?companyId=${encodeURIComponent(state.companyId)}&bluesky_error=${encodeURIComponent(error)}` : `?bluesky_error=${encodeURIComponent(error)}`}`;
  const clearNonce = (response: NextResponse) => response.cookies.set(BLUESKY_NONCE_COOKIE, "", { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/bluesky", maxAge: 0 });
  const fail = (error: string) => { const response = NextResponse.redirect(returnTo(error)); clearNonce(response); return response; };
  const config = blueskyOAuthConfig();
  if (!sdkState || !config || url.searchParams.has("error") || !url.searchParams.has("code")) return fail("grant_cancelled");
  const supabase = await createAdminSupabaseClient();
  const { data: pending } = await supabase.from("bluesky_oauth_states").select("company_id,user_id,encrypted_value,expires_at")
    .eq("state_key", sdkState).maybeSingle();
  if (!pending) return fail("invalid_state");
  let savedState: { appState?: unknown } | null = null;
  try { savedState = JSON.parse(decrypt(pending.encrypted_value)) as { appState?: unknown }; } catch { return fail("invalid_state"); }
  const verified = verifyBlueskyPendingState({ companyId: pending.company_id, userId: pending.user_id, appState: savedState.appState, expiresAt: pending.expires_at }, nonce);
  if (!verified) return fail("invalid_state");
  state = verified;
  const profile = await getSignedInProfile();
  const companyUser = await requireCompanyUser(state.companyId);
  if (!profile || profile.id !== state.userId || profile.role !== "admin" || !companyUser || companyUser.role !== "admin") return fail("not_authorised");

  try {
    const { client, sessionCache } = await createBlueskyOAuthClient({ companyId: state.companyId, userId: state.userId });
    const { session, state: returnedAppState } = await client.callback(url.searchParams);
    if (returnedAppState !== savedState.appState) return fail("invalid_state");
    const did = String(session.did);
    const tokenInfo = await session.getTokenInfo("auto");
    if (tokenInfo.sub !== did || !(tokenInfo.expiresAt instanceof Date) || !Number.isFinite(tokenInfo.expiresAt.getTime()) || tokenInfo.expiresAt.getTime() <= Date.now()) return fail("grant_invalid");
    const savedSession = sessionCache.get(did);
    if (!savedSession) return fail("grant_invalid");
    const profileResponse = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const identity = await profileResponse.json().catch(() => null) as { did?: unknown; handle?: unknown } | null;
    if (!profileResponse.ok || identity?.did !== did || typeof identity.handle !== "string") return fail("grant_invalid");
    const { error } = await supabase.from("company_social_accounts").upsert({
      company_id: state.companyId,
      platform: "bluesky",
      account_name: identity.handle,
      account_id: did,
      access_token_encrypted: encrypt(encodeBlueskySession(did, savedSession)),
      refresh_token_encrypted: null,
      token_expires_at: tokenInfo.expiresAt.toISOString(),
      platform_metadata: { did, handle: identity.handle, auth_method: "atproto_oauth" },
      is_active: true,
    }, { onConflict: "company_id,platform,account_id" });
    if (error) return fail("save_failed");
    const response = NextResponse.redirect(`${url.origin}/publish?companyId=${encodeURIComponent(state.companyId)}&bluesky_connected=1`);
    clearNonce(response);
    return response;
  } catch {
    return fail("grant_invalid");
  }
}
