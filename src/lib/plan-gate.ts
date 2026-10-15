import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import type { PlanTier } from "@/types/database";
import { FEATURE_PLANS, PLAN_NAMES, planAllows, type GatedFeature } from "@/lib/plan-features";

export { FEATURE_PLANS, PLAN_NAMES, PLAN_ORDER, planAllows } from "@/lib/plan-features";
export type { GatedFeature } from "@/lib/plan-features";

/**
 * The company's effective plan (a live trial counts, a lapsed one falls back
 * to the base plan), or null when the company cannot be read.
 */
export async function effectivePlanFor(companyId: string): Promise<PlanTier | null> {
  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase
    .from("companies")
    .select("plan, trial_plan, trial_expires_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  return getEffectivePlan(data as { plan: PlanTier; trial_plan?: PlanTier | null; trial_expires_at?: string | null });
}

/**
 * For API routes, after the caller is authorised for the company: does the
 * company's plan include this feature? Admins are checked by the caller
 * (skip this for them). A company that cannot be read is refused.
 */
export async function requirePlan(
  companyId: string,
  feature: GatedFeature
): Promise<{ ok: true; plan: PlanTier } | { ok: false; response: NextResponse }> {
  const plan = await effectivePlanFor(companyId);
  if (!plan) {
    return { ok: false, response: NextResponse.json({ error: "Company not found" }, { status: 404 }) };
  }
  if (!planAllows(plan, feature)) {
    const needed = FEATURE_PLANS[feature];
    return {
      ok: false,
      response: NextResponse.json(
        { error: `This needs the ${PLAN_NAMES[needed]} plan.`, code: "plan_required", feature },
        { status: 402 }
      ),
    };
  }
  return { ok: true, plan };
}
