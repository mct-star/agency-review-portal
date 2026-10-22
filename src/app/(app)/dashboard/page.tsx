import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/server";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = {
  title: "Welcome | AGENCY",
  description: "Set up your company",
};

/**
 * The dashboard is now /home. This page remains only as the front door for a
 * signed-in person who has no company yet: they get the onboarding wizard.
 * Everyone else is sent to /home.
 */
export default async function DashboardPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  if (profile.role !== "admin" && !profile.company_id) {
    return (
      <OnboardingWizard
        userId={profile.id}
        userName={profile.full_name || undefined}
      />
    );
  }

  redirect("/home");
}
