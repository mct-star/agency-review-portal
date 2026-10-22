import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { exchangeYouTubeCode, exactYouTubeChannel, listMyYouTubeChannels, YOUTUBE_SCOPES } from "@/lib/youtube/client";
import {
  canManageYouTube,
  saveYouTubeAccount,
  YOUTUBE_NONCE_COOKIE,
} from "@/lib/youtube/oauth";
import { verifyYouTubeOAuthState, youtubeStateSecret } from "@/lib/youtube/oauth-state";

/** Complete YouTube OAuth for the signed-in browser, verify one effective channel, and save its grant. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = await verifyYouTubeOAuthState(url.searchParams.get("state"), youtubeStateSecret());
  const jar = await cookies();
  const browserNonce = jar.get(YOUTUBE_NONCE_COOKIE)?.value;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://agency-review-portal.vercel.app");
  const origin = appOrigin.replace(/\/+$/, "");
  const responseCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production" || url.protocol === "https:", sameSite: "lax" as const, path: "/api/auth/youtube" };

  const clearNonce = (response: NextResponse) => {
    response.cookies.set(YOUTUBE_NONCE_COOKIE, "", { ...responseCookieOptions, maxAge: 0 });
    return response;
  };
  const redirect = (companyId: string | null, returnTo: "setup" | "publish", query: string) => {
    const base = returnTo === "publish" || !companyId ? `${origin}/publish` : `${origin}/setup/${companyId}/social`;
    const params = new URLSearchParams(query);
    if (companyId && returnTo === "publish") params.set("companyId", companyId);
    return NextResponse.redirect(`${base}?${params.toString()}`);
  };

  if (!state || !browserNonce || browserNonce !== state.nonce) {
    return clearNonce(redirect(null, "publish", "youtube_error=invalid_state"));
  }
  const back = (query: string) => clearNonce(redirect(state.companyId, state.returnTo, query));
  const { profile, reason } = await canManageYouTube(state.companyId);
  if (!profile || profile.id !== state.userId) return back("youtube_error=not_signed_in");
  if (reason) return back("youtube_error=not_allowed");
  const refused = await refuseHospitality(profile, state.companyId);
  if (refused) return back("youtube_error=not_allowed");

  const providerError = url.searchParams.get("error");
  if (providerError) return back("youtube_error=denied");
  const code = url.searchParams.get("code");
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!code || !clientId || !clientSecret || !redirectUri) return back("youtube_error=not_configured");

  try {
    const tokens = await exchangeYouTubeCode(code, clientId, clientSecret, redirectUri);
    const grantedScopes = new Set(tokens.scope.split(/\s+/).filter(Boolean));
    if (YOUTUBE_SCOPES.some((scope) => !grantedScopes.has(scope))) return back("youtube_error=missing_scope");
    if ([...grantedScopes].some((scope) => !(YOUTUBE_SCOPES as readonly string[]).includes(scope))) {
      return back("youtube_error=unexpected_scope");
    }
    const channels = await listMyYouTubeChannels(tokens.accessToken);
    if (channels.length === 0) return back("youtube_error=no_channel");
    const channel = exactYouTubeChannel(channels);
    if (!channel) return back("youtube_error=ambiguous_channel");
    await saveYouTubeAccount(state.companyId, tokens, channel);
    return back("youtube_connected=1");
  } catch (error) {
    console.error("[YouTube OAuth] connection failed:", error instanceof Error ? error.message : "unknown error");
    return back("youtube_error=connection_failed");
  }
}
