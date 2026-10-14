import type { Metadata } from "next";
import { Suspense } from "react";
import { getUserProfile } from "@/lib/supabase/server";
import UpgradeGate from "@/components/billing/UpgradeGate";
import { effectivePlanFor, FEATURE_PLANS, planAllows } from "@/lib/plan-gate";
import PublishClient from "./PublishClient";
import ClientPublishView from "./ClientPublishView";

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
  // and the direct-publish controls are staff tools.
  if (profile.role !== "admin" && profile.company_id) {
    return <ClientPublishView companyId={profile.company_id} />;
  }

  return (
    <Suspense>
      <PublishClient />
    </Suspense>
  );
}
