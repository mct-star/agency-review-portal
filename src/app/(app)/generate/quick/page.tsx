import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import QuickGenerate from "@/components/generate/QuickGenerate";

export default async function QuickGeneratePage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  // Fetch company data
  type CompanyInfo = { id: string; name: string; spokesperson_name: string | null; spokesperson_tagline: string | null; brand_color: string | null; profile_picture_url: string | null };
  let companies: CompanyInfo[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, spokesperson_name, spokesperson_tagline, brand_color, profile_picture_url")
      .order("name");
    companies = data || [];
  } else if (profile.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, spokesperson_name, spokesperson_tagline, brand_color, profile_picture_url")
      .eq("id", profile.company_id)
      .single();
    if (data) companies = [data];
  }

  // Fetch spokespersons
  const companyIds = companies.map((c) => c.id);
  type SpokespersonInfo = { id: string; company_id: string; name: string; tagline: string | null; profile_picture_url: string | null; is_primary: boolean };
  let spokespersons: SpokespersonInfo[] = [];
  if (companyIds.length > 0) {
    const { data } = await supabase
      .from("company_spokespersons")
      .select("id, company_id, name, tagline, profile_picture_url, is_primary")
      .in("company_id", companyIds)
      .eq("is_active", true)
      .order("sort_order");
    spokespersons = data || [];
  }

  if (companies.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Quick Generate</h1>
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No company set up yet. Complete your company setup first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quick Generate</h1>
        <p className="mt-1 text-sm text-gray-500">Create a single post instantly. No planning required.</p>
      </div>
      <QuickGenerate
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          authorName: c.spokesperson_name || "Author",
          authorTagline: c.spokesperson_tagline || "",
          brandColor: c.brand_color || "#0a66c2",
          profilePictureUrl: c.profile_picture_url || null,
        }))}
        spokespersons={spokespersons.map((s) => ({
          id: s.id,
          companyId: s.company_id,
          name: s.name,
          tagline: s.tagline || "",
          profilePictureUrl: s.profile_picture_url || null,
          isPrimary: s.is_primary,
        }))}
        showCompanyPicker={isAdmin && companies.length > 1}
      />
    </div>
  );
}
