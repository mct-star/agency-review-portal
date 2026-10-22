import type { Metadata } from "next";
import { Suspense } from "react";
import { getUserProfile } from "@/lib/supabase/server";
import UpgradeGate from "@/components/billing/UpgradeGate";
import { effectivePlanFor, FEATURE_PLANS, planAllows } from "@/lib/plan-gate";
import PublishClient from "./PublishClient";
import ClientPublishView from "./ClientPublishView";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Publish | AGENCY",
  description: "Publish approved content",
};

/**
 * The route-level plan check for Publish, the same as Calendar and
 * Compliance: a client whose plan does not include it sees the upgrade card,
 * whatever the menu showed. Admins always pass.
 */
export default async function PublishPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  // Plan check: the same table the menu reads (src/lib/plan-features.ts).
  if (profile.role !== "admin" && profile.company_id) {
    const plan = await effectivePlanFor(profile.company_id);
    if (plan && !planAllows(plan, "publish")) {
      return (
        <div className="p-6">
          <UpgradeGate allowed={false} featureName="Publish" requiredPlan={FEATURE_PLANS.publish} companyId={profile.company_id}>
            <div />
          </UpgradeGate>
        </div>
      );
    }
  }

  // A client sees the download and the connected accounts only; the queue
  // and direct-publish controls stay scoped to their own company.
  if (profile.role !== "admin" && profile.company_id) {
    const supabase = await createAdminSupabaseClient();
    const { data: approved, error: approvedError } = await supabase.from("content_pieces")
      .select("id, title, content_type, week_id")
      .eq("company_id", profile.company_id)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false });
    const pieces = approved || [];
    const weekIds = [...new Set(pieces.map((piece) => piece.week_id).filter((id): id is string => !!id))];
    const { data: weeks, error: weeksError } = weekIds.length ? await supabase.from("weeks")
      .select("id, date_start, date_end")
      .eq("company_id", profile.company_id)
      .in("id", weekIds)
      .order("date_start", { ascending: false }) : { data: [] as Array<{ id: string; date_start: string; date_end: string }>, error: null };
    const { data: company } = await supabase.from("companies").select("post_pack").eq("id", profile.company_id).maybeSingle();
    return <Suspense><ClientPublishView userId={profile.id} companyId={profile.company_id} canPublish={!!profile.can_publish} weeks={weeks || []} pieces={pieces} isHospitality={company?.post_pack === "hospitality"} downloadsUnavailable={!!approvedError || !!weeksError} /></Suspense>;
  }

  return (
    <Suspense>
      <PublishClient userId={profile.id} />
    </Suspense>
  );
}
