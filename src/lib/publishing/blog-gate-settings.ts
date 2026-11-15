import { DEFAULT_BLOG_GATE_SETTINGS, parseBlogGateSettings, type BlogGateSettings } from "@/lib/publishing/blog-gate";
import { BLOG_PUBLISHING_CATEGORY } from "@/lib/publishing/blog-target";

/**
 * A company's blog image gate settings (15 Nov 2026), read from its active
 * company_api_configs row with service_category blog_publishing and
 * provider blog_gate. provider_settings holds the gate settings plus
 * enforceImageChecks, which says whether a failed check blocks publishing
 * for this company. No credentials are involved.
 *
 * No row, or a row that cannot be read, gives the defaults with
 * enforceImageChecks false. Always filtered by company_id.
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

export async function resolveBlogGateSettings(supabase: Reader, companyId: string): Promise<CompanyBlogGateSettings> {
  const { data: row, error } = await supabase.from("company_api_configs")
    .select("provider_settings")
    .eq("company_id", companyId)
    .eq("service_category", BLOG_PUBLISHING_CATEGORY)
    .eq("provider", BLOG_GATE_PROVIDER)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !row) return { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false };
  return parseCompanyBlogGateSettings(row.provider_settings);
}
