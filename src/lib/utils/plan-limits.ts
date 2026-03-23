/**
 * Plan Limits & Feature Gates
 *
 * Defines what each plan tier can do. Used by API endpoints
 * to enforce limits before generating content or running reviews.
 *
 * Plan hierarchy (March 2026):
 * - starter (£30): 20 posts/month, 1 spokesperson, ALL visual styles inc Cinematic 3D, basic voice
 * - pro (£99): unlimited posts, unlimited spokespersons, compliance, carousels, calendar, batch, full voice
 * - agency (£299): everything in pro + face-match PuLID, multi-company, white-label
 *
 * Design principle: Starter gets great VISUALS (Cinematic 3D is the wow factor,
 * costs £0.04/image, generates word-of-mouth). Higher tiers unlock
 * WORKFLOW features (compliance, calendar, batch, multi-company).
 */

import type { PlanTier } from "@/types/database";

export interface PlanFeatures {
  postsPerMonth: number;        // -1 = unlimited
  spokespersons: number;        // -1 = unlimited
  // Visual features
  pixar3d: boolean;             // Pixar/3D character scenes (fal.ai)
  faceMatch: boolean;           // Face-consistent PuLID generation (Agency only)
  carousels: boolean;           // Multi-slide carousel generation
  sceneQuotes: boolean;         // Scene quote (Gemini background + text)
  editorialPhotos: boolean;     // Editorial photography (Gemini)
  // Workflow features
  complianceReview: boolean;    // Regulatory MLR review
  voiceProfileFull: boolean;    // Full voice profile (39 gates) vs basic
  contentCalendar: boolean;     // Calendar planning view
  batchGeneration: boolean;     // Generate whole week at once
  multiPlatformPublish: boolean; // Post to LinkedIn + Bluesky simultaneously
  // Premium features
  multiCompany: boolean;        // Manage multiple companies
  whiteLabel: boolean;          // Custom branding on reports/exports
  // Legacy compatibility
  creativeAI: boolean;          // Kept for backward compat (= faceMatch)
  voiceProfile: boolean;        // Kept for backward compat (= voiceProfileFull)
}

export const PLAN_FEATURES: Record<string, PlanFeatures> = {
  free: {
    postsPerMonth: 5,
    spokespersons: 1,
    pixar3d: false,
    faceMatch: false,
    carousels: false,
    sceneQuotes: false,
    editorialPhotos: false,
    complianceReview: false,
    voiceProfileFull: false,
    contentCalendar: false,
    batchGeneration: false,
    multiPlatformPublish: false,
    multiCompany: false,
    whiteLabel: false,
    creativeAI: false,
    voiceProfile: false,
  },
  starter: {
    postsPerMonth: 20,
    spokespersons: 1,
    pixar3d: true,              // ← Pixar in Starter = the viral moment
    faceMatch: false,           // Face-match is Agency only
    carousels: false,           // Carousels are Pro+
    sceneQuotes: true,          // Free (Gemini)
    editorialPhotos: true,      // Free (Gemini)
    complianceReview: false,
    voiceProfileFull: false,    // Basic voice only
    contentCalendar: false,
    batchGeneration: false,
    multiPlatformPublish: true, // Let them post to LinkedIn + Bluesky
    multiCompany: false,
    whiteLabel: false,
    creativeAI: false,
    voiceProfile: false,
  },
  pro: {
    postsPerMonth: -1,          // Unlimited
    spokespersons: -1,          // Unlimited
    pixar3d: true,
    faceMatch: false,           // Still Agency only
    carousels: true,            // Unlocked at Pro
    sceneQuotes: true,
    editorialPhotos: true,
    complianceReview: true,     // MLR review unlocked
    voiceProfileFull: true,     // Full 39-gate voice matching
    contentCalendar: true,      // Calendar planning
    batchGeneration: true,      // Generate whole weeks
    multiPlatformPublish: true,
    multiCompany: false,
    whiteLabel: false,
    creativeAI: false,
    voiceProfile: true,
  },
  agency: {
    postsPerMonth: -1,
    spokespersons: -1,
    pixar3d: true,
    faceMatch: true,            // ← The premium differentiator
    carousels: true,
    sceneQuotes: true,
    editorialPhotos: true,
    complianceReview: true,
    voiceProfileFull: true,
    contentCalendar: true,
    batchGeneration: true,
    multiPlatformPublish: true,
    multiCompany: true,         // Manage multiple companies
    whiteLabel: true,           // Custom branding
    creativeAI: true,
    voiceProfile: true,
  },
};

export function getPlanFeatures(plan: PlanTier | string): PlanFeatures {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.starter;
}

/**
 * Check if a specific visual style is allowed for a plan.
 * Returns true if allowed, false if gated.
 */
export function isVisualStyleAllowed(plan: PlanTier | string, styleSlug: string): boolean {
  const features = getPlanFeatures(plan);

  // Quote cards are always allowed (programmatic, free)
  if (styleSlug === "quote_card") return true;

  // Scene quotes — Starter+
  if (styleSlug === "scene_quote") return features.sceneQuotes;

  // Editorial photos — Starter+
  if (styleSlug === "editorial_photo") return features.editorialPhotos;

  // Pixar/3D — Starter+ (the viral feature)
  if (styleSlug === "pixar_3d" || styleSlug === "pixar_healthcare" || styleSlug === "pixar_fantasy") {
    return features.pixar3d;
  }

  // Carousels — Pro+
  if (styleSlug === "carousel_framework") return features.carousels;

  // Default: allow
  return true;
}

/**
 * Check if face-match (PuLID) is allowed for a plan.
 */
export function isFaceMatchAllowed(plan: PlanTier | string): boolean {
  return getPlanFeatures(plan).faceMatch;
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
