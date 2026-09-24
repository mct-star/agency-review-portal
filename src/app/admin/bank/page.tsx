import { redirect } from "next/navigation";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import MediaBank from "@/components/admin/MediaBank";

export default async function BankPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");
  const supabase = await createAdminSupabaseClient();
  const { data: companies } = await supabase.from("companies").select("id, name, spokesperson_name").order("name");
  const list = (companies || []) as Array<{ id: string; name: string; spokesperson_name: string | null }>;
  const initial = list.find((c) => c.name === "AGENCY Bristol") || list[0];
  if (!initial) return <p className="text-sm text-gray-600">No companies yet.</p>;
  return <MediaBank companies={list} initialCompanyId={initial.id} />;
}
