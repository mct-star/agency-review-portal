/**
 * CTA Hierarchy Resolver
 *
 * Determines which CTA URL each posting slot gets based on:
 * - The post type's natural affinity (blog teasers = soft, Friday = conversion)
 * - The day-of-week position (escalation through the week)
 * - The company's ranked CTA URLs
 *
 * The week ecosystem has a deliberate escalation pattern:
 * Mon-Wed: Secondary CTAs (download guide, read blog, subscribe)
 * Thu-Fri: Primary CTAs (book a call, schedule demo)
 * Sat: Tertiary or none (soft engagement, coffee comment)
 * Sun: Blog link (not a CTA URL — handled separately)
 */

export type CtaTier = 'primary' | 'secondary' | 'tertiary';

export interface CompanyCtaUrlRow {
  id: string;
  label: string;
  url: string;
  link_text: string | null;
  cta_tier: CtaTier;
  is_active: boolean;
  sort_order: number;
}

export interface ResolvedCta {
  tier: CtaTier;
  url: string;
  linkText: string | null;
  label: string;
}

// Post type -> natural CTA tier affinity
const POST_TYPE_CTA_TIER: Record<string, CtaTier> = {
  // Early-week engagement posts → secondary (content consumption)
  problem_post: 'secondary',
  insight: 'secondary',
  launch_story: 'secondary',
  if_i_was: 'secondary',

  // Mid-week authority posts → escalate to primary
  contrarian: 'secondary',
  tactical: 'secondary',

  // End-of-week conversion posts → primary
  founder_friday: 'primary',
  triage_cta: 'primary',
  blog_cta: 'primary',

  // Soft engagement → tertiary
  weekend_personal: 'tertiary',
  personal: 'tertiary',
  story: 'tertiary',

  // Blog teaser → no CTA URL (uses blog link instead)
  blog_teaser: 'tertiary',

  // Anchor content → primary (in the content body, not first comment)
  blog_article: 'primary',
  linkedin_article: 'primary',
};

// Day-of-week escalation override
// If the post type doesn't have a strong tier affinity, use day position
const DAY_TIER_FALLBACK: Record<number, CtaTier> = {
  0: 'tertiary',  // Sunday
  1: 'secondary', // Monday
  2: 'secondary', // Tuesday
  3: 'secondary', // Wednesday
  4: 'primary',   // Thursday
  5: 'primary',   // Friday
  6: 'tertiary',  // Saturday
};

export function resolveCtaForSlot(
  postTypeSlug: string,
  dayOfWeek: number,
  ctaUrls: CompanyCtaUrlRow[]
): ResolvedCta | null {
  // Filter to active CTAs only
  const activeCtas = ctaUrls.filter(c => c.is_active);
  if (activeCtas.length === 0) return null;

  // Determine the desired tier
  const desiredTier = POST_TYPE_CTA_TIER[postTypeSlug] || DAY_TIER_FALLBACK[dayOfWeek] || 'secondary';

  // Find CTAs at the desired tier, sorted by sort_order
  const tierCtas = activeCtas.filter(c => c.cta_tier === desiredTier).sort((a, b) => a.sort_order - b.sort_order);

  if (tierCtas.length > 0) {
    const cta = tierCtas[0];
    return { tier: desiredTier, url: cta.url, linkText: cta.link_text, label: cta.label };
  }

  // Fallback: if no CTAs at the desired tier, try adjacent tiers
  // Primary falls back to secondary, tertiary falls back to secondary
  const fallbackTier = desiredTier === 'primary' ? 'secondary' : desiredTier === 'tertiary' ? 'secondary' : 'primary';
  const fallbackCtas = activeCtas.filter(c => c.cta_tier === fallbackTier).sort((a, b) => a.sort_order - b.sort_order);

  if (fallbackCtas.length > 0) {
    const cta = fallbackCtas[0];
    return { tier: cta.cta_tier as CtaTier, url: cta.url, linkText: cta.link_text, label: cta.label };
  }

  // Last resort: use any active CTA
  const anyCta = activeCtas.sort((a, b) => a.sort_order - b.sort_order)[0];
  return { tier: anyCta.cta_tier as CtaTier, url: anyCta.url, linkText: anyCta.link_text, label: anyCta.label };
}

/**
 * Determines the ecosystem role for a content piece based on its post type.
 * Used for the `ecosystem_role` column on content_pieces.
 */
export function getEcosystemRole(postTypeSlug: string): string {
  const roles: Record<string, string> = {
    blog_article: 'anchor',
    linkedin_article: 'anchor',
    pdf_guide: 'anchor',
    blog_teaser: 'teaser',
    blog_cta: 'cta_escalation',
    triage_cta: 'cta_escalation',
    problem_post: 'engagement',
    insight: 'engagement',
    launch_story: 'engagement',
    if_i_was: 'engagement',
    contrarian: 'engagement',
    tactical: 'engagement',
    founder_friday: 'engagement',
    weekend_personal: 'personal_bridge',
    personal: 'personal_bridge',
    story: 'personal_bridge',
  };
  return roles[postTypeSlug] || 'engagement';
}
