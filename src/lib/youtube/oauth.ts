/** Shared YouTube connection checks and encrypted credential persistence. */

import { decrypt, encrypt } from "@/lib/crypto";
import { createAdminSupabaseClient, requireCompanyUser } from "@/lib/supabase/admin";
import type { YouTubeChannel, YouTubeTokens } from "@/lib/youtube/client";

export const YOUTUBE_NONCE_COOKIE = "youtube_oauth_nonce";

export async function canManageYouTube(companyId: string) {
  const profile = await requireCompanyUser(companyId);
  if (!profile) return { profile: null, reason: "unauthorized" as const };
  if (profile.role !== "admin" && !profile.can_publish) return { profile, reason: "forbidden" as const };
  return { profile, reason: null };
}

export async function saveYouTubeAccount(companyId: string, tokens: YouTubeTokens, channel: YouTubeChannel) {
  const supabase = await createAdminSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("company_social_accounts")
    .select("id, refresh_token_encrypted")
    .eq("company_id", companyId)
    .eq("platform", "youtube")
    .eq("account_id", channel.id)
    .maybeSingle();
  if (existingError) throw new Error("The YouTube connection could not be checked.");

  const refreshToken = tokens.refreshToken || (existing?.refresh_token_encrypted ? decrypt(existing.refresh_token_encrypted) : null);
  if (!refreshToken) throw new Error("Google did not provide an offline refresh token. Reconnect and approve offline access.");

  const { data, error } = await supabase
    .from("company_social_accounts")
    .upsert({
      company_id: companyId,
      platform: "youtube",
      account_id: channel.id,
      account_name: channel.title,
      access_token_encrypted: encrypt(tokens.accessToken),
      refresh_token_encrypted: tokens.refreshToken ? encrypt(tokens.refreshToken) : existing?.refresh_token_encrypted,
      token_expires_at: tokens.expiresAt,
      platform_metadata: {
        channel_id: channel.id,
        custom_url: channel.customUrl,
        thumbnail: channel.thumbnail,
        scope: tokens.scope,
      },
      is_active: true,
    }, { onConflict: "company_id,platform,account_id" })
    .select("id, account_id, account_name")
    .single();
  if (error || !data) throw new Error("The YouTube connection could not be saved.");
  return { id: data.id, accountId: data.account_id, accountName: data.account_name };
}
