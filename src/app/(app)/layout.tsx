import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getUser, getUserProfile } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ResponsiveSidebar from "@/components/layout/ResponsiveSidebar";
import TrialBanner from "@/components/layout/TrialBanner";
import HelpChatWidget from "@/components/chat/HelpChatWidget";
import ViewAsBanner from "@/components/layout/ViewAsBanner";
import { getEffectivePlan, getTrialDaysRemaining } from "@/lib/utils/get-effective-plan";
import { isB2bOnlyPage } from "@/lib/hospitality/b2b-only";
import localFont from "next/font/local";
import WorkspaceHeader from "@/components/layout/WorkspaceHeader";
import "./workspace.css";

const workspaceFont = localFont({ src: "../../../public/fonts/Jost-variable-latin.woff2", variable: "--font-workspace", display: "swap", weight: "100 900" });

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
          <p className="text-sm text-gray-500">
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
  let companyComplexity: string = "advanced";
  let trialDaysRemaining: number | null = null;
  let postPack = "b2b";
  let waitingCount = 0;

  if (companyId) {
    // This user is a client user tied to a specific company — show their logo
    const { data: company } = await supabase
      .from("companies")
      .select("logo_url, plan, trial_plan, trial_expires_at, setup_complexity")
      .eq("id", companyId)
      .single();
    platformLogoUrl = company?.logo_url || null;
    companyPlan = company ? getEffectivePlan(company as { plan: "free" | "pro" | "agency"; trial_plan?: "free" | "pro" | "agency" | null; trial_expires_at?: string | null }) : "free";
    companyComplexity = (company as Record<string, unknown>)?.setup_complexity as string || "advanced";
    trialDaysRemaining = company ? getTrialDaysRemaining(company) : null;
    // Read on its own so a missing column can never take the plan and logo down with it.
    const { data: packRow } = await supabase.from("companies").select("post_pack").eq("id", companyId).maybeSingle();
    postPack = (packRow as { post_pack?: string } | null)?.post_pack || "b2b";
    if (postPack === "hospitality") {
      // What is waiting for a person: drafts to approve and photos from the team.
      const [drafts, photos] = await Promise.all([
        supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("approval_status", "pending").eq("content_type", "social_post"),
        supabase.from("photo_inventory").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      ]);
      waitingCount = (drafts.count ?? 0) + (photos.count ?? 0);
    }
    // A hospitality venue's people have a short menu with none of the
    // business-to-business tools. If one is reached by typing its address, say
    // so plainly rather than show tools that were never set up for the venue.
    if (postPack === "hospitality" && profile.role !== "admin") {
      const pathname = (await headers()).get("x-pathname") ?? "";
      if (isB2bOnlyPage(pathname)) redirect("/not-available");
    }
  } else if (profile.role === "admin") {
    // Admin (agency operator) — always show the agency's own company logo,
    // NOT a random client's logo. Also pass their company ID for sidebar "My Brand" link.
    const platformSlug = process.env.PLATFORM_COMPANY_SLUG || "agency-bristol";
    const { data: agencyCompany } = await supabase
      .from("companies")
      .select("id, logo_url")
      .eq("slug", platformSlug)
      .single();
    platformLogoUrl = agencyCompany?.logo_url || null;
    // Inject the agency company_id into the profile so the sidebar can show "My Brand"
    if (agencyCompany?.id) {
      profile.company_id = agencyCompany.id;
    }
  }

  return (
    <div className={`workspace ${workspaceFont.variable} flex h-dvh flex-col md:h-screen md:flex-row`}>
      <a href="#workspace-main" className="workspace-skip workspace-button">Skip to content</a>
      <ResponsiveSidebar user={profile} platformLogoUrl={platformLogoUrl} companyPlan={companyPlan} complexity={companyComplexity} postPack={postPack} waitingCount={waitingCount} />
      <main id="workspace-main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto outline-none">
        <WorkspaceHeader user={profile} postPack={postPack} />
        {profile.viewing_as && <ViewAsBanner companyName={profile.viewing_as.companyName} />}
        {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
          <TrialBanner daysRemaining={trialDaysRemaining} />
        )}
        <div className="workspace-content">{children}</div>
      </main>
      <HelpChatWidget />
    </div>
  );
}
