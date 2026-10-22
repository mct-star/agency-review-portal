import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany, type AccessProfile } from "@/lib/auth/permissions";

/**
 * Authorisation for the photo and video library.
 *
 * The library routes used to call requireAdmin(), so a company user
 * could neither upload nor browse. They now call these instead: an
 * admin still reaches every company, a member reaches their own, and
 * anyone else is refused. A bank item is looked up first so the check
 * is made against the company that actually owns it, never against a
 * companyId the caller supplied.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Refusal = { ok: false; status: 400 | 401 | 403 | 404; error: string };
export type CompanyGrant = { ok: true; profile: AccessProfile & Record<string, unknown> };

export async function authoriseCompany(
  companyId: unknown
): Promise<CompanyGrant | Refusal> {
  const profile = await getSignedInProfile();
  if (!profile) return { ok: false, status: 401, error: "Unauthorized" };
  if (typeof companyId !== "string" || !UUID_RE.test(companyId)) {
    return { ok: false, status: 400, error: "companyId is required and must be a uuid" };
  }
  if (!canAccessCompany(profile, companyId)) {
    return { ok: false, status: 403, error: "You do not have access to this company" };
  }
  return { ok: true, profile };
}

export async function authoriseBankItem<T extends { company_id: string }>(
  id: string,
  columns = "id, company_id"
): Promise<(CompanyGrant & { item: T }) | Refusal> {
  const profile = await getSignedInProfile();
  if (!profile) return { ok: false, status: 401, error: "Unauthorized" };
  if (!UUID_RE.test(id)) return { ok: false, status: 400, error: "Invalid id" };

  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase
    .from("photo_inventory")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  const item = data as unknown as T | null;

  // A member asking for another company's item gets the same answer as
  // for an item that does not exist, so ids cannot be probed.
  if (!item || !canAccessCompany(profile, item.company_id)) {
    return { ok: false, status: 404, error: "Not found" };
  }
  return { ok: true, profile, item };
}
