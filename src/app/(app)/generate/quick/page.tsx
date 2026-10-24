import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import QuickGenerate from "@/components/generate/QuickGenerate";
import HospitalityQuickPost from "@/components/hospitality/HospitalityQuickPost";
import { plannedDraftLabel, readDraftPlan } from "@/lib/calendar/quick-create";
import { getPostType } from "@/lib/constants/post-types";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getUserProfile();
  const company = profile?.company as { post_pack?: string | null } | null | undefined;
  const venue = profile?.role !== "admin" && company?.post_pack === "hospitality";
  return venue
    ? { title: "Write a post | AGENCY", description: "Write one post for your venue" }
    : { title: "Quick Generate | AGENCY", description: "Create a single post instantly" };
}

export default async function QuickGeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; postType?: string; company?: string; companyId?: string; date?: string; time?: string }>;
}) {
  const params = await searchParams;
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
  const requestedCompanyId = params.company || params.companyId;
  const selectedCompanyId = companyIds.includes(requestedCompanyId || "") ? requestedCompanyId : undefined;
  const plan = readDraftPlan(params.date, params.time);
  if ((params.date || params.time) && !selectedCompanyId) plan.error = "Choose a company and slot in Calendar before planning this draft.";
  type SpokespersonInfo = { id: string; company_id: string; name: string; tagline: string | null; profile_picture_url: string | null; is_primary: boolean };
  let spokespersons: SpokespersonInfo[] = [];
  if (companyIds.length > 0) {
    // The client role has no direct SELECT policy on company_spokespersons in
    // production. The company ids above are already scoped to this signed-in
    // profile, so use the server client while retaining an explicit tenant filter.
    const adminSupabase = await createAdminSupabaseClient();
    const { data } = await adminSupabase
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
        <p className="workspace-eyebrow">Create in your voice</p>
        <h1 className="workspace-title">Quick Generate</h1>
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No company set up yet. Complete your company setup first.</p>
        </div>
      </div>
    );
  }

  // A hospitality company writes from its own pack. Read on its own so an
  // older database without the pack column still shows the usual page.
  const { data: packRows } = await supabase.from("companies").select("id, name, post_pack").in("id", companyIds);
  const hospitalityCompanies = ((packRows || []) as Array<{ id: string; name: string; post_pack: string | null }>).filter((c) => c.post_pack === "hospitality");
  const hospitalityTarget = isAdmin
    ? hospitalityCompanies.find((c) => c.id === selectedCompanyId)
    : hospitalityCompanies[0];
  if (hospitalityTarget) {
    return (
      <div className="workspace-quick space-y-6">
        <div>
          <p className="workspace-eyebrow">Create in your voice</p>
        <h1 className="workspace-title">Write a post</h1>
          <p className="workspace-description">Tell us what you want to say. We write it, pick a photo from your library, and leave it for you to approve.</p>
        </div>
        <HospitalityQuickPost key={`${hospitalityTarget.id}:${params.date || ""}:${params.time || ""}`} companyId={hospitalityTarget.id}
          initialDate={plan.date || undefined} initialTime={plan.time || undefined} initialPostType={params.postType}
          initialPlanningError={plan.error || undefined} />
      </div>
    );
  }

  const plannedFormat = params.postType ? getPostType(params.postType) : undefined;
  if (!isAdmin && selectedCompanyId && plan.date && plannedFormat && plannedFormat.production !== "portal") {
    return <div className="workspace-panel space-y-4 p-5 sm:p-7">
      <h1 className="workspace-title">This format needs AGENCY production</h1>
      <p className="text-sm text-gray-700">{plannedDraftLabel(plan)}</p>
      <p className="text-sm text-gray-700">Ask your administrator to prepare {plannedFormat.label}, or return to Calendar to choose another format.</p>
      <a href={`/calendar?${new URLSearchParams({ companyId: selectedCompanyId, date: plan.date })}`} className="workspace-button workspace-button-secondary">Return to Calendar</a>
    </div>;
  }

  return (
    <div className="workspace-quick space-y-6">
      <div>
        <p className="workspace-eyebrow">Create in your voice</p>
        <h1 className="workspace-title">Quick Generate</h1>
        <p className="workspace-description">Create a single post instantly. No planning required.</p>
      </div>
      <QuickGenerate
        key={`${selectedCompanyId || "default"}:${params.date || ""}:${params.time || ""}`}
        initialCompanyId={selectedCompanyId}
        initialScheduledDate={plan.date || undefined}
        initialScheduledTime={plan.time || undefined}
        initialPlanningError={plan.error || undefined}
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
        initialTopic={params?.topic || undefined}
        initialPostType={params?.postType || undefined}
      />
    </div>
  );
}
