import { redirect } from "next/navigation";
import { getUserProfile, createServerSupabaseClient } from "@/lib/supabase/server";
import PersonContentSetup from "./PersonContentSetup";

interface PageProps {
  params: Promise<{ companyId: string; personId: string }>;
}

export default async function PersonContentSetupPage({ params }: PageProps) {
  const { companyId, personId } = await params;
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  // Verify access: must be admin or belong to this company
  const isAdmin = profile.role === "admin";
  if (!isAdmin && profile.company_id !== companyId) {
    redirect("/dashboard");
  }

  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, plan")
    .eq("id", companyId)
    .single();

  if (!company) {
    redirect("/setup/content");
  }

  return (
    <PersonContentSetup
      companyId={companyId}
      personId={personId}
      companyPlan={company.plan || "free"}
    />
  );
}
