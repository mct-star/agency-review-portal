import type { Metadata } from "next";
import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/server";
import ComingUp from "@/components/hospitality/ComingUp";

export const metadata: Metadata = { title: "Coming up | AGENCY" };
export const dynamic = "force-dynamic";

export default async function ComingUpPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const profile = await getUserProfile();
  if (!profile) return null;
  const params = await searchParams;
  const companyId = profile.role === "admin" ? params.company || profile.company_id : profile.company_id;
  if (!companyId) return <p className="text-sm text-gray-600">Choose a company first.</p>;
  if (profile.role !== "admin" && profile.company_id !== companyId) return null;

  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase.from("companies").select("id, name, post_pack").eq("id", companyId).maybeSingle();
  if (!company) return <p className="text-sm text-gray-600">Company not found.</p>;
  if (company.post_pack !== "hospitality") {
    return (
      <p className="text-sm text-gray-600">
        This is for venues. <Link href={`/setup/${companyId}/hospitality`} className="text-violet-700 underline">Change the pack</Link> to use it.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Coming up</h1>
        <p className="mt-1 text-sm text-gray-500">
          {company.name}. Your events and new dishes, menus and offers. We draft the posts for them at the right time, one a day, and you approve each one.
        </p>
      </div>
      <ComingUp companyId={company.id as string} />
    </div>
  );
}
