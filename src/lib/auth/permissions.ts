/**
 * Who may touch which company's data.
 *
 * Kept free of any Supabase or Next import so the rule can be unit
 * tested on its own. The route helpers in `@/lib/supabase/admin` load
 * the signed-in profile and call these.
 *
 * Roles today: `admin` (AGENCY staff, every company) and `client` (a
 * member of exactly one company, `company_id`).
 */

export interface AccessProfile {
  id: string;
  role: string;
  company_id: string | null;
}

/** An admin may act on any company. A member may act only on their own. */
export function canAccessCompany(
  profile: AccessProfile | null | undefined,
  companyId: string | null | undefined
): boolean {
  if (!profile || !companyId) return false;
  if (profile.role === "admin") return true;
  return profile.company_id === companyId;
}

/**
 * Inviting someone into a company: admins into any company, a member
 * into their own company only. Whether the invitee may publish is a
 * separate decision that only an admin can make.
 */
export function canInvite(
  profile: AccessProfile | null | undefined,
  companyId: string | null | undefined
): boolean {
  return canAccessCompany(profile, companyId);
}

export function canSetPublishRight(profile: AccessProfile | null | undefined): boolean {
  return !!profile && profile.role === "admin";
}

/** The company id is the first path segment of every object in `captures`. */
export function companyIdFromCapturePath(path: string): string | null {
  const first = path.split("/")[0];
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(first) ? first : null;
}
