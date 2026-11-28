import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseChannelManager } from "@/lib/auth/channel-manager";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, getAdministeredOrganizations, getProfile } from "@/lib/linkedin/client";
import { connectionErrorMessage } from "./token-error";
import { canPostAsOrganisation, linkedInApp } from "./app";
import { oauthStateSecret, verifyOAuthState } from "./oauth-state";
import { saveLinkedInPhoto } from "./profile-photo";
import { firstPageBecomesDefault, withDefaultFlag, type PageRow } from "./default-page";

/**
 * The one LinkedIn OAuth callback, used by /api/auth/linkedin/callback and by
 * the legacy branch of /api/auth/linkedin (whichever address LinkedIn is
 * registered to redirect to).
 *
 * The state must verify, the caller must be the signed-in user who started
 * the flow and must still be allowed to act for the company in the state (an
 * admin, or a client of that company with the publish right), and the browser always returns to the (app) tree: the company's
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

  const auth = await authoriseChannelManager(verified.companyId, { fence: true });
  if (!auth.ok) {
    return NextResponse.redirect(returnUrl(`linkedin_error=${auth.status === 401 ? "not_signed_in" : "not_authorised"}`));
  }
  if (auth.profile.id !== verified.userId) {
    return NextResponse.redirect(returnUrl("linkedin_error=not_signed_in"));
  }

  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(returnUrl(`linkedin_error=${msg}`));
  }

  if (!code) {
    return NextResponse.redirect(returnUrl("linkedin_error=missing_params"));
  }

  const app = linkedInApp();
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${origin}/api/auth/linkedin/callback`;

  if (!app) {
    return NextResponse.redirect(returnUrl(`linkedin_error=${encodeURIComponent("LinkedIn is not configured")}`));
  }

  try {
    const tokens = await exchangeCodeForTokens(code, app.clientId, app.clientSecret, redirectUri, app.scopes);
    const profile = await getProfile(tokens.accessToken, tokens.scope);
    const supabase = await createAdminSupabaseClient();
    const accessTokenEncrypted = encrypt(tokens.accessToken);
    const refreshTokenEncrypted = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

    const { data: saved, error: upsertErr } = await supabase
      .from("company_social_accounts")
      .upsert(
        {
          company_id: verified.companyId,
          platform: "linkedin_personal",
          account_name: profile.name,
          account_id: profile.sub,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokens.expiresAt,
          platform_metadata: {
            app: app.app,
            picture: profile.picture,
            email: profile.email,
            given_name: profile.givenName,
            family_name: profile.familyName,
            scope: tokens.scope,
          },
          is_active: true,
        },
        { onConflict: "company_id,platform,account_id" }
      )
      .select("id")
      .maybeSingle();

    if (upsertErr) {
      console.error("[LinkedIn OAuth] upsert failed:", upsertErr.message);
      return NextResponse.redirect(returnUrl(`linkedin_error=${encodeURIComponent("The connection could not be saved. Try again.")}`));
    }

    // A working personal connection now exists, so retire this company's
    // personal rows it replaces: URL-only stubs with no token, and expired
    // rows for the same person from the older app. Rows are deactivated,
    // never deleted, so publishing history keeps its account.
    const savedId = (saved as { id?: string } | null)?.id;
    if (savedId && Date.parse(tokens.expiresAt) > Date.now()) {
      await retireReplacedPersonalRows(supabase, verified.companyId, savedId, profile.name);
    }

    // Best effort: keep a durable copy of the profile photo for the matching person. Never fails the connection.
    await saveLinkedInPhoto(supabase, verified.companyId, { name: profile.name, picture: profile.picture });

    let pagesParam = "";
    if (canPostAsOrganisation(tokens.scope)) {
      try {
        const pages = await getAdministeredOrganizations(tokens.accessToken);
        // Reconnecting refreshes a page's token and details and nothing else: a page the
        // user switched off stays off, and the default never moves. Only a company that
        // has never had a page, connecting exactly one, gets a default.
        const { data: existingData, error: existingErr } = await supabase.from("company_social_accounts")
          .select("id, account_id, is_active, platform_metadata").eq("company_id", verified.companyId).eq("platform", "linkedin_company");
        if (existingErr) throw new Error(`could not read the company's existing pages: ${existingErr.message}`);
        const existing = (Array.isArray(existingData) ? existingData : []) as Array<PageRow & { account_id: string | null }>;
        const byAccount = new Map(existing.map((row) => [row.account_id, row]));
        const makeFirstDefault = firstPageBecomesDefault(existing, pages.length);
        let savedPages = 0;
        for (const [index, page] of pages.entries()) {
          const known = byAccount.get(page.id);
          const { error: pageErr } = await supabase.from("company_social_accounts").upsert(
            {
              company_id: verified.companyId,
              platform: "linkedin_company",
              account_name: page.name,
              account_id: page.id,
              // The member's grant posts as the page, so the page row holds the same token.
              access_token_encrypted: accessTokenEncrypted,
              refresh_token_encrypted: refreshTokenEncrypted,
              token_expires_at: tokens.expiresAt,
              platform_metadata: {
                ...withDefaultFlag(known?.platform_metadata, known ? known.platform_metadata?.default_page === true : makeFirstDefault && index === 0),
                app: app.app,
                organization_urn: page.urn,
                vanity_name: page.vanityName,
                connected_member_id: profile.sub,
                connected_member_name: profile.name,
                scope: tokens.scope,
              },
              is_active: known ? known.is_active === true : true,
            },
            { onConflict: "company_id,platform,account_id" }
          );
          if (pageErr) console.error("[LinkedIn OAuth] page upsert failed:", pageErr.message);
          else savedPages++;
        }
        pagesParam = savedPages === pages.length ? `&linkedin_pages=${savedPages}` : "&linkedin_pages_error=1";
      } catch (err) {
        console.error("[LinkedIn OAuth] page lookup failed:", err instanceof Error ? err.message : err);
        pagesParam = "&linkedin_pages_error=1";
      }
    }

    return NextResponse.redirect(returnUrl(`linkedin_connected=1${pagesParam}`));
  } catch (err) {
    console.error("[LinkedIn OAuth] error:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(returnUrl(`linkedin_error=${encodeURIComponent(connectionErrorMessage(err))}`));
  }
}

/**
 * Deactivate this company's personal LinkedIn rows that the new connection
 * replaces: any with no token (a profile URL stub), and any for the same
 * named person whose token has expired. Called only after the new row is saved.
 */
async function retireReplacedPersonalRows(supabase: SupabaseClient, companyId: string, keepId: string, memberName: string) {
  const { data: rows } = await supabase.from("company_social_accounts")
    .select("id, account_name, access_token_encrypted, token_expires_at")
    .eq("company_id", companyId).eq("platform", "linkedin_personal").eq("is_active", true).neq("id", keepId);
  const now = Date.now();
  const replaced = ((Array.isArray(rows) ? rows : []) as Array<{ id: string; account_name: string | null; access_token_encrypted: string | null; token_expires_at: string | null }>)
    .filter((row) => {
      if (!row.access_token_encrypted) return true;
      const expiry = row.token_expires_at ? Date.parse(row.token_expires_at) : Number.NaN;
      const expired = !Number.isFinite(expiry) || expiry <= now;
      return expired && !!row.account_name && row.account_name.trim().toLowerCase() === memberName.trim().toLowerCase();
    })
    .map((row) => row.id);
  if (!replaced.length) return;
  const { error } = await supabase.from("company_social_accounts").update({ is_active: false })
    .eq("company_id", companyId).eq("platform", "linkedin_personal").neq("id", keepId).in("id", replaced);
  if (error) console.error("[LinkedIn OAuth] could not retire replaced rows:", error.message);
}
