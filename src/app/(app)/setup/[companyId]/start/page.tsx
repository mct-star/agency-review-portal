/** Guided company setup, reached from Home, reusing saved brand settings and the permanent Connections manager. */
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { loadSetupReadiness, nextSetupStep, type SetupCompany } from "@/lib/onboarding/readiness";
import { progressForCompany } from "@/lib/onboarding/progress";
import WorkspaceSetup from "@/components/onboarding/WorkspaceSetup";

export const metadata = { title: "Workspace setup | AGENCY" };

export default async function StartSetupPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const profile = await getUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && profile.company_id !== companyId) redirect("/home");
  const supabase = await createServerSupabaseClient();
  const { data: company, error } = await supabase.from("companies")
    .select("id, name, description, blog_base_url, post_pack").eq("id", companyId).maybeSingle();
  if (error) throw new Error("Workspace setup could not be loaded. Please try again.");
  if (!company) notFound();
  const readiness = await loadSetupReadiness(supabase, company as SetupCompany);
  const { data: { user } } = await supabase.auth.getUser();
  const hospitality = company.post_pack === "hospitality";
  const initial = progressForCompany(user?.user_metadata, companyId, hospitality);
  return <WorkspaceSetup company={company} userId={profile.id} readiness={readiness}
    initialStep={initial?.step || nextSetupStep(readiness, hospitality)}
    canConnect={profile.role === "admin"} canPublish={profile.role === "admin" || !!profile.can_publish}
    readOnly={!!profile.viewing_as} />;
}
