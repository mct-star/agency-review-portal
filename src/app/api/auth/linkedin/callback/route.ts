import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, getProfile } from "@/lib/linkedin/client";

/**
 * GET /api/auth/linkedin/callback?code=...&state=...
 *
 * LinkedIn redirects here after the user grants access.
 * We exchange the authorization code for an access token,
 * fetch the user's profile, and store both in company_social_accounts.
 *
 * The `state` param carries either:
 * - Just the companyId (e.g. "uuid-here")
 * - companyId|returnTo (e.g. "uuid-here|setup") for redirect back to setup page
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Parse state to extract companyId and optional returnTo
  const [companyId, returnTo] = (state || "").split("|");

  function getRedirectUrl(params: string) {
    if (returnTo === "setup" && companyId) {
      return `${origin}/setup/${companyId}/social?${params}`;
    }
    return `${origin}/publish?${params}`;
  }

  // LinkedIn returned an error (user denied, etc.)
  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(getRedirectUrl(`linkedin_error=${msg}`));
  }

  if (!code || !companyId) {
    return NextResponse.redirect(getRedirectUrl("linkedin_error=missing_params"));
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI ||
    `${origin}/api/auth/linkedin/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      getRedirectUrl(`linkedin_error=${encodeURIComponent("LinkedIn credentials not configured")}`)
    );
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);

    // Get the user's LinkedIn profile (person ID, name, photo)
    const profile = await getProfile(tokens.accessToken);

    const supabase = await createAdminSupabaseClient();

    // Upsert the social account — keyed on company_id + platform + account_id
    const { error: upsertErr } = await supabase
      .from("company_social_accounts")
      .upsert(
        {
          company_id: companyId,
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
      console.error("Failed to store LinkedIn account:", upsertErr);
      return NextResponse.redirect(
        getRedirectUrl(`linkedin_error=${encodeURIComponent("Failed to save connection")}`)
      );
    }

    // Success
    return NextResponse.redirect(getRedirectUrl("linkedin_connected=1"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth failed";
    console.error("LinkedIn OAuth error:", err);
    return NextResponse.redirect(
      getRedirectUrl(`linkedin_error=${encodeURIComponent(msg)}`)
    );
  }
}
