import type { PlanTier } from "@/types/database";

/**
 * Resolve the effective plan for a company, accounting for active trials.
 *
 * If the company has an active trial (trial_plan set and trial_expires_at in the future),
 * return the trial plan tier. Otherwise return the base plan.
 */
export function getEffectivePlan(company: {
  plan: PlanTier;
  trial_plan?: PlanTier | null;
  trial_expires_at?: string | null;
}): PlanTier {
  if (
    company.trial_plan &&
    company.trial_expires_at &&
    new Date(company.trial_expires_at) > new Date()
  ) {
    return company.trial_plan;
  }
  return company.plan;
}

/**
 * Get the number of days remaining in a trial, or null if no active trial.
 */
export function getTrialDaysRemaining(company: {
  trial_expires_at?: string | null;
}): number | null {
  if (!company.trial_expires_at) return null;
  const expires = new Date(company.trial_expires_at);
  const now = new Date();
  if (expires <= now) return 0;
  return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
