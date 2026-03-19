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
 * The `state` param carries the companyId that was passed when
 * starting the OAuth flow via GET /api/auth/linkedin?companyId=...
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // companyId
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // LinkedIn returned an error (user denied, etc.)
  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(`${origin}/publish?linkedin_error=${msg}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/publish?linkedin_error=missing_params`);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI ||
    `${origin}/api/auth/linkedin/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${origin}/publish?linkedin_error=${encodeURIComponent("LinkedIn credentials not configured")}`
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
          company_id: state,
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
        `${origin}/publish?linkedin_error=${encodeURIComponent("Failed to save connection")}`
      );
    }

    // Success — redirect to publish page with success flag
    return NextResponse.redirect(`${origin}/publish?linkedin_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth failed";
    console.error("LinkedIn OAuth error:", err);
    return NextResponse.redirect(
      `${origin}/publish?linkedin_error=${encodeURIComponent(msg)}`
    );
  }
}
