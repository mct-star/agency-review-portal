import { encrypt } from "@/lib/crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createBlueskySession, sessionCredentials } from "@/lib/bluesky/direct";

/** Validates a user-supplied Bluesky app password and stores only the resulting session tokens. */
export async function connectBlueskyAccount(companyId: string, handle: string, appPassword: string) {
  const identifier = handle.trim().replace(/^@/, "");
  if (!identifier || !appPassword.trim()) return { ok: false as const, status: 400, error: "Enter a Bluesky handle and app password." };
  const normalizedHandle = identifier.includes(".") ? identifier : `${identifier}.bsky.social`;
  const session = await createBlueskySession(normalizedHandle, appPassword);
  const credentials = sessionCredentials(session);
  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase.from("company_social_accounts").upsert({
    company_id: companyId,
    platform: "bluesky",
    account_name: session.handle,
    account_id: session.did,
    access_token_encrypted: encrypt(credentials.accessToken),
    refresh_token_encrypted: credentials.refreshToken ? encrypt(credentials.refreshToken) : null,
    token_expires_at: credentials.expiresAt,
    platform_metadata: { did: session.did, handle: session.handle, auth_method: "app_password_session" },
    is_active: true,
  }, { onConflict: "company_id,platform,account_id" });
  if (error) return { ok: false as const, status: 500, error: "The Bluesky connection could not be saved." };
  return { ok: true as const, handle: session.handle, did: session.did };
}
