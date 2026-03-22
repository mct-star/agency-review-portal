import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getProfile,
} from "@/lib/linkedin/client";

/**
 * LinkedIn OAuth2 flow for connecting a company's LinkedIn account.
 *
 * Flow:
 * 1. Admin clicks "Connect LinkedIn" → GET /api/auth/linkedin?companyId=uuid
 *    → Redirects to LinkedIn authorization page
 * 2. User authorizes → LinkedIn redirects back to
 *    GET /api/auth/linkedin?code=xxx&state=companyId
 * 3. We exchange the code for tokens, fetch the profile, store everything
 *    in company_social_accounts, then redirect back to the admin page
 */

function getLinkedInConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set in environment variables"
    );
  }

  return { clientId, clientSecret };
}

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  // Must exactly match what's registered in the LinkedIn Developer Portal.
  // Reads from env var first (set in Vercel), falls back to dynamic origin.
  return (
    process.env.LINKEDIN_REDIRECT_URI ||
    `${url.origin}/api/auth/linkedin/callback`
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Phase 1: If we have a companyId but no code, start the OAuth flow
  const companyId = searchParams.get("companyId");
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // companyId is passed as state

  // ── Start OAuth Flow ──────────────────────────────────────
  if (companyId && !code) {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { clientId } = getLinkedInConfig();
      const redirectUri = getRedirectUri(request);
      // Encode returnTo in state so callback knows where to redirect
      const returnTo = searchParams.get("returnTo");
      const stateValue = returnTo ? `${companyId}|${returnTo}` : companyId;
      const authUrl = getAuthorizationUrl(clientId, redirectUri, stateValue);

      return NextResponse.redirect(authUrl);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Configuration error" },
        { status: 500 }
      );
    }
  }

  // ── OAuth Callback ────────────────────────────────────────
  if (code && state) {
    try {
      const { clientId, clientSecret } = getLinkedInConfig();
      const redirectUri = getRedirectUri(request);
      const targetCompanyId = state; // companyId was passed as state

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(
        code,
        clientId,
        clientSecret,
        redirectUri
      );

      // Fetch the user's profile to get their LinkedIn person ID
      const profile = await getProfile(tokens.accessToken);

      // Store in database
      const supabase = await createAdminSupabaseClient();

      const row = {
        company_id: targetCompanyId,
        platform: "linkedin_personal" as const,
        account_name: profile.name,
        account_id: profile.sub,
        access_token_encrypted: encrypt(tokens.accessToken),
        refresh_token_encrypted: tokens.refreshToken
          ? encrypt(tokens.refreshToken)
          : null,
        token_expires_at: tokens.expiresAt,
        platform_metadata: {
          given_name: profile.givenName,
          family_name: profile.familyName,
          picture: profile.picture,
          email: profile.email,
          scope: tokens.scope,
        },
        is_active: true,
      };

      const { error: upsertErr } = await supabase
        .from("company_social_accounts")
        .upsert(row, {
          onConflict: "company_id,platform,account_id",
        });

      if (upsertErr) {
        console.error("Failed to store LinkedIn tokens:", upsertErr);
        return NextResponse.redirect(
          new URL(
            `/admin/companies/${targetCompanyId}/social-accounts?error=storage_failed`,
            request.url
          )
        );
      }

      // Success — redirect back to the social accounts page
      return NextResponse.redirect(
        new URL(
          `/admin/companies/${targetCompanyId}/social-accounts?linkedin=connected`,
          request.url
        )
      );
    } catch (err) {
      console.error("LinkedIn OAuth callback error:", err);
      const errorMessage = encodeURIComponent(
        err instanceof Error ? err.message : "Unknown error"
      );
      return NextResponse.redirect(
        new URL(
          `/admin/companies/${state}/social-accounts?error=${errorMessage}`,
          request.url
        )
      );
    }
  }

  // ── Error from LinkedIn ───────────────────────────────────
  const error = searchParams.get("error");
  if (error) {
    const description = searchParams.get("error_description") || error;
    const stateForRedirect = state || "";
    return NextResponse.redirect(
      new URL(
        `/admin/companies/${stateForRedirect}/social-accounts?error=${encodeURIComponent(description)}`,
        request.url
      )
    );
  }

  return NextResponse.json(
    { error: "Invalid request. Use ?companyId=uuid to start OAuth flow." },
    { status: 400 }
  );
}
