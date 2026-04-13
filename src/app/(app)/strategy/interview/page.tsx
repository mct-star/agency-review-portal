import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StrategyInterview from "@/components/strategy/StrategyInterview";

export const metadata: Metadata = {
  title: "Strategy Interview | AGENCY",
  description: "Guided strategy interview to build your content strategy",
};

export default async function StrategyInterviewPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  const supabase = await createServerSupabaseClient();
  let companyId = profile.company_id;

  // Admin users may not have a company_id — pick the first company
  if (!companyId && profile.role === "admin") {
    const { data: firstCompany } = await supabase
      .from("companies")
      .select("id")
      .order("name")
      .limit(1)
      .single();
    if (firstCompany) companyId = firstCompany.id;
  }

  if (!companyId) redirect("/home");

  // Fetch company name
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) redirect("/home");

  // Fetch existing strategy session
  const { data: session } = await supabase
    .from("strategy_sessions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch existing audiences
  const { data: audiences } = await supabase
    .from("strategy_audiences")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order");

  // Fetch existing positioning
  const { data: positioning } = await supabase
    .from("strategy_positioning")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  return (
    <StrategyInterview
      companyId={company.id}
      companyName={company.name}
      initialSession={session ?? null}
      existingAudiences={audiences ?? []}
      existingPositioning={positioning ?? null}
    />
  );
}
