import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import CompanyConnections from "@/components/connections/CompanyConnections";

/** The permanent company-scoped Settings home for social publishing connections. */
export default async function CompanySocialPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const profile = await getUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && profile.company_id !== companyId) redirect("/home");
  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase.from("companies").select("post_pack").eq("id", companyId).maybeSingle();
  return <Suspense fallback={<p className="text-sm text-gray-600">Loading connections...</p>}>
    <CompanyConnections userId={profile.id} companyId={companyId} canPublish={profile.role === "admin" || !!profile.can_publish} canConnect={profile.role === "admin"} isHospitality={company?.post_pack === "hospitality"} />
  </Suspense>;
}
