import type { Metadata } from "next";
import { getUserProfile } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import CompetitorAnalysis from "@/components/strategy/CompetitorAnalysis";

export const metadata: Metadata = { title: "Competitor Analysis | AGENCY" };

export default async function CompetitorPage() {
  const profile = await getUserProfile();
  if (!profile) return null;
  const supabase = await createServerSupabaseClient();

  let companyId = profile.company_id;
  let companyName = "";
  let industry = "";

  if (companyId) {
    const { data } = await supabase
      .from("companies")
      .select("name, industry")
      .eq("id", companyId)
      .single();
    companyName = data?.name || "";
    industry = data?.industry || "";
  } else if (profile.role === "admin") {
    const { data } = await supabase
      .from("companies")
      .select("id, name, industry")
      .order("name")
      .limit(1)
      .single();
    if (data) {
      companyId = data.id;
      companyName = data.name;
      industry = data.industry || "";
    }
  }

  if (!companyId) return <p>No company found.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Competitor Content Analysis
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Analyse a competitor&apos;s content strategy and find gaps you can own.
        </p>
      </div>
      <CompetitorAnalysis
        companyId={companyId}
        companyName={companyName}
        industry={industry}
      />
    </div>
  );
}
