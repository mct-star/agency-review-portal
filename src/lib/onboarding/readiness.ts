import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SetupStep } from "./progress";

export type SetupCompany = {
  id: string;
  name?: string | null;
  description?: string | null;
  website_url?: string | null;
  blog_base_url?: string | null;
  post_pack?: string | null;
};
export type SetupReadiness = { brand: boolean; voice: boolean; connections: boolean; unavailable: boolean };

/** Reads existing shared company facts, never a collaborator's personal setup preference. */
export async function loadSetupReadiness(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  company: SetupCompany,
): Promise<SetupReadiness> {
  const hospitality = company.post_pack === "hospitality";
  const [voice, accounts] = await Promise.allSettled([
    hospitality ? Promise.resolve({ count: 0, error: null }) : supabase.from("company_voice_profiles")
      .select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("is_active", true),
    supabase.from("company_social_accounts").select("platform, token_expires_at")
      .eq("company_id", company.id).eq("is_active", true)
      .not("access_token_encrypted", "is", null).not("account_id", "is", null)
      .in("platform", hospitality ? ["facebook", "instagram"] : ["linkedin_personal", "facebook", "instagram", "twitter", "bluesky", "threads", "pinterest", "youtube"]),
  ]);
  const voices = voice.status === "fulfilled" ? voice.value : null;
  const connected = accounts.status === "fulfilled" ? accounts.value : null;
  return {
    brand: !!company.name?.trim() && !!company.description?.trim(),
    voice: hospitality || (voices?.count ?? 0) > 0,
    connections: (connected?.data || []).some((account: { platform: string; token_expires_at: string | null }) =>
      account.token_expires_at
        ? Date.parse(account.token_expires_at) > Date.now()
        : account.platform !== "linkedin_personal"),
    unavailable: !voices || !!voices.error || !connected || !!connected.error,
  };
}

export function nextSetupStep(readiness: SetupReadiness, hospitality: boolean): SetupStep {
  if (!readiness.brand) return "brand";
  if (!hospitality && !readiness.voice) return "voice";
  if (!readiness.connections) return "connections";
  return "create";
}
