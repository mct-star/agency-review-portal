import { NextResponse } from "next/server";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, getProfile } from "@/lib/linkedin/client";
import { oauthStateSecret, verifyOAuthState } from "./oauth-state";

/**
 * The one LinkedIn OAuth callback, used by /api/auth/linkedin/callback and by
 * the legacy branch of /api/auth/linkedin (whichever address LinkedIn is
 * registered to redirect to).
 *
 * The state must verify, the caller must be the signed-in admin who started
 * the flow, and the browser always returns to the (app) tree: the company's
 * Connections page, or /publish when it started there.
 */
export async function handleLinkedInCallback(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const verified = await verifyOAuthState(state, oauthStateSecret());

  function returnUrl(params: string) {
    if (!verified) return `${origin}/setup?${params}`;
    if (verified.returnTo === "publish") return `${origin}/publish?${params}`;
    return `${origin}/setup/${verified.companyId}/social?${params}`;
  }

  if (!verified) {
    return NextResponse.redirect(returnUrl("linkedin_error=invalid_state"));
  }

  const admin = await requireAdmin();
  if (!admin || admin.id !== verified.userId) {
    return NextResponse.redirect(returnUrl("linkedin_error=not_signed_in"));
  }

  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(returnUrl(`linkedin_error=${msg}`));
  }

  if (!code) {
    return NextResponse.redirect(returnUrl("linkedin_error=missing_params"));
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${origin}/api/auth/linkedin/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(returnUrl(`linkedin_error=${encodeURIComponent("LinkedIn is not configured")}`));
  }

  try {
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
    const profile = await getProfile(tokens.accessToken);
    const supabase = await createAdminSupabaseClient();

    const { error: upsertErr } = await supabase
      .from("company_social_accounts")
      .upsert(
        {
          company_id: verified.companyId,
          platform: "linkedin_personal",
          account_name: profile.name,
          account_id: profile.sub,
          access_token_encrypted: encrypt(tokens.accessToken),
          refresh_token_encrypted: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
          token_expires_at: tokens.expiresAt,
          platform_metadata: {
            picture: profile.picture,
            email: profile.email,
            given_name: profile.givenName,
            family_name: profile.familyName,
            scope: tokens.scope,
          },
          is_active: true,
        },
        { onConflict: "company_id,platform,account_id" }
      );

    if (upsertErr) {
      console.error("[LinkedIn OAuth] upsert failed:", upsertErr.message);
      return NextResponse.redirect(returnUrl(`linkedin_error=${encodeURIComponent("The connection could not be saved. Try again.")}`));
    }

    return NextResponse.redirect(returnUrl("linkedin_connected=1"));
  } catch (err) {
    console.error("[LinkedIn OAuth] error:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(returnUrl(`linkedin_error=${encodeURIComponent("LinkedIn did not complete the connection. Try again.")}`));
  }
}
