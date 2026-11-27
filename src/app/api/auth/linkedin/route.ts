import { NextResponse } from "next/server";
import { authoriseChannelManager } from "@/lib/auth/channel-manager";
import { getAuthorizationUrl } from "@/lib/linkedin/client";
import { linkedInApp } from "@/lib/linkedin/app";
import { oauthStateSecret, signOAuthState } from "@/lib/linkedin/oauth-state";
import { handleLinkedInCallback } from "@/lib/linkedin/oauth-callback";

/**
 * LinkedIn OAuth2 flow for connecting a company's LinkedIn account: the
 * member's own profile and, through the AGENCY Content Publisher app, every
 * LinkedIn page that member administers (see src/lib/linkedin/app.ts).
 *
 * 1. An admin, or a client of that company with the publish right, opens GET /api/auth/linkedin?companyId=uuid[&returnTo=setup|publish]
 *    and is redirected to LinkedIn with a signed, expiring state.
 * 2. LinkedIn redirects back to /api/auth/linkedin/callback (or here, if that
 *    is the registered address). The callback verifies the state, that the
 *    signed-in user is the one who started the flow and may still act for that
 *    company, then stores the tokens.
 */

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return process.env.LINKEDIN_REDIRECT_URI || `${url.origin}/api/auth/linkedin/callback`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (companyId && !code) {
    const auth = await authoriseChannelManager(companyId, { fence: true });
    if (!auth.ok) return auth.response;
    const app = linkedInApp();
    const secret = oauthStateSecret();
    if (!app || !secret) {
      return NextResponse.json({ error: "LinkedIn is not configured" }, { status: 503 });
    }
    const returnTo = searchParams.get("returnTo") === "publish" ? "publish" : "setup";
    const signed = await signOAuthState({ companyId, userId: auth.profile.id, returnTo }, secret);
    return NextResponse.redirect(getAuthorizationUrl(app.clientId, getRedirectUri(request), signed, app.scopes));
  }

  if (code || state || searchParams.get("error")) {
    return handleLinkedInCallback(request);
  }

  return NextResponse.json(
    { error: "Invalid request. Use ?companyId=uuid to start the connection." },
    { status: 400 }
  );
}
