import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";
import { getAuthorizationUrl } from "@/lib/linkedin/client";
import { oauthStateSecret, signOAuthState } from "@/lib/linkedin/oauth-state";
import { handleLinkedInCallback } from "@/lib/linkedin/oauth-callback";

/**
 * LinkedIn OAuth2 flow for connecting a company's LinkedIn account.
 *
 * 1. An admin opens GET /api/auth/linkedin?companyId=uuid[&returnTo=setup|publish]
 *    and is redirected to LinkedIn with a signed, expiring state.
 * 2. LinkedIn redirects back to /api/auth/linkedin/callback (or here, if that
 *    is the registered address). The callback verifies the state and that the
 *    signed-in admin started the flow, then stores the tokens.
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
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const secret = oauthStateSecret();
    if (!clientId || !secret) {
      return NextResponse.json({ error: "LinkedIn is not configured" }, { status: 503 });
    }
    const returnTo = searchParams.get("returnTo") === "publish" ? "publish" : "setup";
    const signed = await signOAuthState({ companyId, userId: admin.id, returnTo }, secret);
    return NextResponse.redirect(getAuthorizationUrl(clientId, getRedirectUri(request), signed));
  }

  if (code || state || searchParams.get("error")) {
    return handleLinkedInCallback(request);
  }

  return NextResponse.json(
    { error: "Invalid request. Use ?companyId=uuid to start the connection." },
    { status: 400 }
  );
}
