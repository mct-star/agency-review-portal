/**
 * Which plan each gated feature needs. The one table: the client menu
 * (src/app/(app)/nav.ts), the page checks and the API checks
 * (src/lib/plan-gate.ts) all read it. This file has no server imports so the
 * sidebar, a client component, can use it; plan-gate.ts re-exports it.
 */
export type PlanTier = "free" | "starter" | "pro" | "agency";

/** The same order as nav.ts: free < starter < pro < agency. */
export const PLAN_ORDER: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

export const FEATURE_PLANS = {
  calendar: "pro",
  weeklyPlanner: "pro",
  compliance: "pro",
  publish: "pro",
  analytics: "pro",
  connections: "pro",
  weekBatch: "starter",
} as const satisfies Record<string, PlanTier>;

export type GatedFeature = keyof typeof FEATURE_PLANS;

export const PLAN_NAMES: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
};

/** True when `plan` is at or above the plan the feature needs. An unknown plan counts as Free. */
export function planAllows(plan: string, feature: GatedFeature): boolean {
  const have = PLAN_ORDER[plan as PlanTier] ?? 0;
  return have >= PLAN_ORDER[FEATURE_PLANS[feature]];
}
