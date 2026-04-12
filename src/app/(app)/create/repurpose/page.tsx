import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import RepurposeEngine from "@/components/create/RepurposeEngine";

export const metadata: Metadata = {
  title: "Repurpose Content | AGENCY",
  description: "Turn one blog post or article into multiple content pieces",
};

export default async function RepurposePage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  type CompanyInfo = { id: string; name: string };
  let companies: CompanyInfo[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .order("name");
    companies = data || [];
  } else if (profile.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", profile.company_id)
      .single();
    if (data) companies = [data];
  }

  if (companies.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Repurpose Content</h1>
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">
            No company set up yet. Complete your company setup first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Repurpose Content</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste one blog post or article. Get multiple content pieces auto-generated from it.
        </p>
      </div>
      <RepurposeEngine
        companies={companies}
        showCompanyPicker={isAdmin && companies.length > 1}
      />
    </div>
  );
}
