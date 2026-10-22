import { NextResponse } from "next/server";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { getYouTubeAuthorizationUrl } from "@/lib/youtube/client";
import { canManageYouTube, YOUTUBE_NONCE_COOKIE } from "@/lib/youtube/oauth";
import { signYouTubeOAuthState, YOUTUBE_STATE_TTL_SECONDS, youtubeStateSecret } from "@/lib/youtube/oauth-state";
import { randomBytes } from "node:crypto";

/** Start a browser-bound YouTube OAuth connection for an authorised company publisher. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return NextResponse.json({ error: "A valid companyId is required." }, { status: 400 });
  }

  const { profile, reason } = await canManageYouTube(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (reason) return NextResponse.json({ error: "Your account cannot manage publishing." }, { status: 403 });
  const refused = await refuseHospitality(profile, companyId);
  if (refused) return refused;

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const secret = youtubeStateSecret();
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !secret) {
    return NextResponse.json({ error: "YouTube connections are not configured." }, { status: 503 });
  }

  const nonce = randomBytes(32).toString("base64url");
  const returnTo = url.searchParams.get("returnTo") === "publish" ? "publish" : "setup";
  const state = await signYouTubeOAuthState({ companyId, userId: profile.id, returnTo, nonce }, secret);
  const response = NextResponse.redirect(getYouTubeAuthorizationUrl(clientId, redirectUri, state));
  response.cookies.set(YOUTUBE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/youtube",
    maxAge: YOUTUBE_STATE_TTL_SECONDS,
  });
  return response;
}
