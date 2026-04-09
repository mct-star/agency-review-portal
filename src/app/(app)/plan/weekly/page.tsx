import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import WeeklyPlanner from "@/components/plan/WeeklyPlanner";
import type { PlanTier } from "@/types/database";

export const metadata: Metadata = {
  title: "Weekly Planner | AGENCY",
  description: "Design your weekly posting rhythm with narrative arc",
};

export default async function WeeklyPlannerPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";
  const companyId = profile.company_id;

  if (!companyId && !isAdmin) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-500">No company configured yet.</p>
      </div>
    );
  }

  // For admin, pick the first company if no company_id on profile
  let activeCompanyId = companyId;
  if (!activeCompanyId && isAdmin) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .order("name")
      .limit(1);
    activeCompanyId = companies?.[0]?.id || null;
  }

  if (!activeCompanyId) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-500">No companies configured yet.</p>
      </div>
    );
  }

  // Fetch posting slots and post types via the existing API data shape
  const { data: slots } = await supabase
    .from("posting_slots")
    .select("*, post_types(*)")
    .eq("company_id", activeCompanyId)
    .order("sort_order");

  const { data: postTypes } = await supabase
    .from("post_types")
    .select("*")
    .order("slug");

  // Fetch company name
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", activeCompanyId)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Planner</h1>
        <p className="mt-1 text-sm text-gray-500">
          Map post types to days and build your weekly narrative arc.
        </p>
      </div>

      <WeeklyPlanner
        companyId={activeCompanyId}
        companyName={company?.name || "Company"}
        initialSlots={slots || []}
        initialPostTypes={postTypes || []}
      />
    </div>
  );
}
