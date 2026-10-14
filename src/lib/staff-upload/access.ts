import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decideRate } from "./rate-limit";
import { hashIp, isPlausibleToken } from "./token";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface StaffCompany {
  id: string;
  name: string;
  plan: string;
  trial_plan: string | null;
  trial_expires_at: string | null;
}

/** The company a staff link belongs to, or null when the link is unknown or switched off. */
export async function companyForToken(supabase: SupabaseAdmin, token: unknown): Promise<StaffCompany | null> {
  if (!isPlausibleToken(token)) return null;
  const { data } = await supabase
    .from("companies")
    .select("id, name, plan, trial_plan, trial_expires_at, staff_upload_enabled")
    .eq("staff_upload_token", token)
    .maybeSingle();
  if (!data || !data.staff_upload_enabled) return null;
  return data as StaffCompany;
}

/**
 * Count and record this attempt, then decide. The attempt is recorded first
 * so a burst of parallel requests cannot all pass on the same count.
 */
export async function checkAndRecordAttempt(
  supabase: SupabaseAdmin,
  companyId: string,
  forwardedFor: string | null
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const salt = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "staff-upload";
  const ipHash = hashIp(forwardedFor, salt);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("staff_upload_attempts").insert({ company_id: companyId, ip_hash: ipHash });
  if (insertError) return decideRate({ ipLastTenMinutes: null, companyLastHour: null });

  const [ip, company] = await Promise.all([
    supabase.from("staff_upload_attempts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("ip_hash", ipHash).gte("created_at", tenMinutesAgo),
    supabase.from("staff_upload_attempts").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", hourAgo),
  ]);
  return decideRate({
    ipLastTenMinutes: ip.error ? null : ip.count ?? 0,
    companyLastHour: company.error ? null : company.count ?? 0,
  });
}
