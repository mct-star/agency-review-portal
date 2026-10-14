import type { Metadata } from "next";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/server";
import MediaBank from "@/components/admin/MediaBank";

export const metadata: Metadata = {
  title: "Photo and video library | AGENCY",
  description: "Your real photos and clips, in one place",
};

/**
 * The photo and video library for the signed-in company. A company user
 * sees their own library; an admin gets a company picker. The data comes
 * through /api/bank, which checks company membership on every request.
 */
export default async function LibraryPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createAdminSupabaseClient();
  const isAdmin = profile.role === "admin";

  let query = supabase.from("companies").select("id, name, spokesperson_name").order("name");
  if (!isAdmin) {
    if (!profile.company_id) {
      return <p className="text-sm text-gray-600">Your account is not linked to a company yet.</p>;
    }
    query = query.eq("id", profile.company_id);
  }
  const { data } = await query;
  const list = (data || []) as Array<{ id: string; name: string; spokesperson_name: string | null }>;
  if (list.length === 0) return <p className="text-sm text-gray-600">No companies yet.</p>;

  const initial =
    list.find((c) => c.id === profile.company_id) ||
    list.find((c) => c.name === "AGENCY Bristol") ||
    list[0];
  return <MediaBank companies={list} initialCompanyId={initial.id} />;
}
