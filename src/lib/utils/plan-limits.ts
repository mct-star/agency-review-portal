/**
 * Plan Limits & Feature Gates
 *
 * Defines what each plan tier can do. Used by API endpoints
 * to enforce limits before generating content or running reviews.
 *
 * Plan hierarchy:
 * - starter (free): 5 posts/month, 1 spokesperson, no compliance, basic images
 * - pro ($99): unlimited posts, unlimited spokespersons, compliance review, full voice
 * - agency ($299): everything in pro + Creative AI, multi-company, white-label
 */

import type { PlanTier } from "@/types/database";

export interface PlanFeatures {
  postsPerMonth: number;        // -1 = unlimited
  spokespersons: number;        // -1 = unlimited
  complianceReview: boolean;
  voiceProfile: boolean;        // Full voice (not just basic)
  contentCalendar: boolean;
  creativeAI: boolean;          // Pixar 3D, face-match, carousels
  batchGeneration: boolean;
  multiCompany: boolean;
  whiteLabel: boolean;
}

export const PLAN_FEATURES: Record<string, PlanFeatures> = {
  free: {
    postsPerMonth: 5,
    spokespersons: 1,
    complianceReview: false,
    voiceProfile: false,
    contentCalendar: false,
    creativeAI: false,
    batchGeneration: false,
    multiCompany: false,
    whiteLabel: false,
  },
  starter: {
    postsPerMonth: 5,
    spokespersons: 1,
    complianceReview: false,
    voiceProfile: false,
    contentCalendar: false,
    creativeAI: false,
    batchGeneration: false,
    multiCompany: false,
    whiteLabel: false,
  },
  pro: {
    postsPerMonth: -1,
    spokespersons: -1,
    complianceReview: true,
    voiceProfile: true,
    contentCalendar: true,
    creativeAI: false,
    batchGeneration: true,
    multiCompany: false,
    whiteLabel: false,
  },
  agency: {
    postsPerMonth: -1,
    spokespersons: -1,
    complianceReview: true,
    voiceProfile: true,
    contentCalendar: true,
    creativeAI: true,
    batchGeneration: true,
    multiCompany: true,
    whiteLabel: true,
  },
};

export function getPlanFeatures(plan: PlanTier | string): PlanFeatures {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.starter;
}

/**
 * Check if a company has exceeded their monthly post limit.
 * Returns { allowed: boolean, used: number, limit: number, remaining: number }
 */
export async function checkPostLimit(
  supabase: { from: (table: string) => unknown },
  companyId: string,
  plan: PlanTier | string
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
  const features = getPlanFeatures(plan);
  if (features.postsPerMonth === -1) {
    return { allowed: true, used: 0, limit: -1, remaining: -1 };
  }

  // Count posts created this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from("content_pieces")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", monthStart);

  const used = count || 0;
  const remaining = Math.max(0, features.postsPerMonth - used);

  return {
    allowed: used < features.postsPerMonth,
    used,
    limit: features.postsPerMonth,
    remaining,
  };
}
