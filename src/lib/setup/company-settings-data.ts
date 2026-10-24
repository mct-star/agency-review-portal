import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSettingsPeople(supabase: SupabaseClient, companyId: string) {
  const [{ data: people }, { count }] = await Promise.all([
    supabase.from("company_spokespersons")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("company_spokespersons")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  return { people: people ?? [], count: count ?? 0 };
}

export async function getProductionWeekCount(supabase: SupabaseClient, companyId: string) {
  const { count } = await supabase.from("weeks")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gt("week_number", 0);
  return count ?? 0;
}
