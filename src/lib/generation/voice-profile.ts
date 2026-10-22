import type { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** A person's saved voice overrides the shared company voice; a new spokesperson inherits it. */
export async function loadGenerationVoiceProfile(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  companyId: string,
  spokespersonId?: string | null,
) {
  if (spokespersonId) {
    const { data, error } = await supabase.from("company_voice_profiles").select("*")
      .eq("company_id", companyId).eq("spokesperson_id", spokespersonId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Your writing voice could not be loaded. Try again.");
    if (data) return data;
  }
  const { data, error } = await supabase.from("company_voice_profiles").select("*")
    .eq("company_id", companyId).is("spokesperson_id", null).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Your writing voice could not be loaded. Try again.");
  return data;
}
