import { DEFAULT_BLOG_GATE_SETTINGS, parseBlogGateSettings, type BlogGateSettings } from "@/lib/publishing/blog-gate";
import { BLOG_PUBLISHING_CATEGORY } from "@/lib/publishing/blog-target";

/**
 * A company's blog image gate settings (15 Nov 2026), read from its active
 * company_api_configs row with service_category blog_publishing and
 * provider blog_gate. provider_settings holds the gate settings plus
 * enforceImageChecks, which says whether a failed check blocks publishing
 * for this company. No credentials are involved.
 *
 * No row gives the defaults with enforceImageChecks false, and so does a
 * row without the key. A key that is present but not true or false is a
 * refusal (15 Nov 2026), and so is a read that fails, not the defaults:
 * the publish route must not let a blog through because the company's
 * settings could not be read or say nothing clear. Callers
 * that only show the checks may fall back to the defaults themselves.
 * Always filtered by company_id.
 */

export const BLOG_GATE_PROVIDER = "blog_gate";

export interface CompanyBlogGateSettings extends BlogGateSettings {
  enforceImageChecks: boolean;
}

/** Settings from stored JSON, field by field; enforceImageChecks is false unless it is exactly true. */
export function parseCompanyBlogGateSettings(value: unknown): CompanyBlogGateSettings {
  const enforce = !!value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).enforceImageChecks === true;
  return { ...parseBlogGateSettings(value), enforceImageChecks: enforce };
}

// Only the one method the resolver needs from the Supabase client.
type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const BLOG_GATE_SETTINGS_UNREADABLE =
  "This company's blog checks could not be read, so nothing was sent. Try again.";

export const BLOG_GATE_ENFORCE_INVALID =
  "This company's blog checks are set up wrongly: enforceImageChecks must be true or false.";

/** The defaults, not enforced: what a company with no row gets. */
export const DEFAULT_COMPANY_BLOG_GATE_SETTINGS: CompanyBlogGateSettings = { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false };

export async function resolveBlogGateSettings(
  supabase: Reader, companyId: string,
): Promise<{ settings: CompanyBlogGateSettings } | { refusal: string }> {
  const { data: row, error } = await supabase.from("company_api_configs")
    .select("provider_settings")
    .eq("company_id", companyId)
    .eq("service_category", BLOG_PUBLISHING_CATEGORY)
    .eq("provider", BLOG_GATE_PROVIDER)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { refusal: BLOG_GATE_SETTINGS_UNREADABLE };
  if (!row) return { settings: { ...DEFAULT_COMPANY_BLOG_GATE_SETTINGS } };
  // Absent means not enforcing; present but not a boolean (the string
  // "true", the number 1) is a set-up mistake, never a silent "no".
  const stored = row.provider_settings;
  if (stored && typeof stored === "object" && !Array.isArray(stored) && "enforceImageChecks" in stored
    && typeof (stored as Record<string, unknown>).enforceImageChecks !== "boolean") {
    return { refusal: BLOG_GATE_ENFORCE_INVALID };
  }
  return { settings: parseCompanyBlogGateSettings(row.provider_settings) };
}
