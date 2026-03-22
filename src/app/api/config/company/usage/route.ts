import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { checkPostLimit } from "@/lib/utils/plan-limits";
import type { PlanTier } from "@/types/database";

/**
 * GET /api/config/company/usage?companyId=xxx
 *
 * Returns current month's post usage and limit for the company.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();

  const { data: company } = await supabase
    .from("companies")
    .select("plan, trial_plan, trial_expires_at")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const effectivePlan = getEffectivePlan(company as { plan: PlanTier; trial_plan?: PlanTier | null; trial_expires_at?: string | null });
  const usage = await checkPostLimit(supabase, companyId, effectivePlan);

  return NextResponse.json({
    plan: effectivePlan,
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
    allowed: usage.allowed,
  });
}
