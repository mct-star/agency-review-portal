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
    console.log("[LinkedIn OAuth] Token exchange successful, expires:", tokens.expiresAt);

    // Get the user's LinkedIn profile (person ID, name, photo)
    const profile = await getProfile(tokens.accessToken);
    console.log("[LinkedIn OAuth] Profile fetched:", profile.name, "sub:", profile.sub);

    const supabase = await createAdminSupabaseClient();

    const hasAccessToken = !!tokens.accessToken;
    const tokenLength = tokens.accessToken?.length || 0;
    console.log("[LinkedIn OAuth] Storing token for company:", companyId, "hasToken:", hasAccessToken, "tokenLength:", tokenLength);

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
      console.error("[LinkedIn OAuth] Upsert FAILED:", JSON.stringify(upsertErr));
      return NextResponse.redirect(
        getRedirectUrl(`linkedin_error=${encodeURIComponent("Failed to save connection: " + upsertErr.message)}`)
      );
    }

    console.log("[LinkedIn OAuth] Upsert SUCCESS for company:", companyId);

    // Verify the token was actually stored
    const { data: verify } = await supabase
      .from("company_social_accounts")
      .select("id, access_token_encrypted")
      .eq("company_id", companyId)
      .eq("platform", "linkedin_personal")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!verify?.access_token_encrypted) {
      console.error("[LinkedIn OAuth] VERIFICATION FAILED - token not in database after upsert! Row:", verify?.id);
      return NextResponse.redirect(
        getRedirectUrl(`linkedin_error=${encodeURIComponent("Token was not saved correctly. Please try again.")}`)
      );
    }

    console.log("[LinkedIn OAuth] Verification PASSED - token stored for row:", verify.id);

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
