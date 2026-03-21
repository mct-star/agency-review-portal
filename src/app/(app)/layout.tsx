import { redirect } from "next/navigation";
import { getUser, getUserProfile } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";

/**
 * Authenticated layout for the three main sections: Setup, Generate, Review.
 * All routes under (app)/ require authentication.
 * Admin-only restrictions are handled per-page, not at the layout level.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile();

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm border border-gray-200 text-center">
          <h1 className="text-xl font-bold text-gray-900">Almost there</h1>
          <p className="text-sm text-gray-500">
            You&apos;re signed in as <strong>{user.email}</strong> but your
            account hasn&apos;t been set up yet.
          </p>
          <p className="text-sm text-gray-400">
            Ask an admin to add you to the portal.
          </p>
        </div>
      </div>
    );
  }

  // Fetch the platform/agency logo.
  // This is always the AGENCY's own company logo (the operator of the platform),
  // NOT a client company's logo. The agency's company is identified by the env var
  // PLATFORM_COMPANY_SLUG (defaults to "agency-bristol").
  // Client users with a company_id assigned will see their own company's logo instead.
  const supabase = await createServerSupabaseClient();
  const companyId = profile.company_id;
  let platformLogoUrl: string | null = null;
  let companyPlan: string = "free";

  if (companyId) {
    // This user is a client user tied to a specific company — show their logo
    const { data: company } = await supabase
      .from("companies")
      .select("logo_url, plan")
      .eq("id", companyId)
      .single();
    platformLogoUrl = company?.logo_url || null;
    companyPlan = company?.plan || "free";
  } else if (profile.role === "admin") {
    // Admin (agency operator) — always show the agency's own company logo,
    // NOT a random client's logo
    const platformSlug = process.env.PLATFORM_COMPANY_SLUG || "agency-bristol";
    const { data: agencyCompany } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("slug", platformSlug)
      .single();
    platformLogoUrl = agencyCompany?.logo_url || null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={profile} platformLogoUrl={platformLogoUrl} companyPlan={companyPlan} />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
    </div>
  );
}
