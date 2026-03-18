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

  // Fetch platform logo (from the first company, or the user's company)
  const supabase = await createServerSupabaseClient();
  const companyId = profile.company_id;
  let platformLogoUrl: string | null = null;

  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .single();
    platformLogoUrl = company?.logo_url || null;
  } else if (profile.role === "admin") {
    // Admin without a company — fetch the first company's logo
    const { data: companies } = await supabase
      .from("companies")
      .select("logo_url")
      .order("created_at")
      .limit(1);
    platformLogoUrl = companies?.[0]?.logo_url || null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={profile} platformLogoUrl={platformLogoUrl} />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
    </div>
  );
}
