import { redirect } from "next/navigation";
import { getUserProfile, createServerSupabaseClient } from "@/lib/supabase/server";
import BrandContentSetup from "./BrandContentSetup";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function BrandContentSetupPage({ params }: PageProps) {
  const { companyId } = await params;
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
    .select("name, plan, brand_color")
    .eq("id", companyId)
    .single();

  if (!company) {
    redirect("/setup/content");
  }

  return (
    <BrandContentSetup
      companyId={companyId}
      companyName={company.name}
      companyPlan={company.plan || "free"}
    />
  );
}
