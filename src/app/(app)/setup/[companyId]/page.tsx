import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ImageUploader from "./ImageUploader";
import OverlayPreview from "./OverlayPreview";
import PlanSelector from "./PlanSelector";
import QuickStrategySetup from "@/components/setup/QuickStrategySetup";
import type { PlanTier } from "@/types/database";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

// minPlan: the minimum tier required to access this step
const SETUP_STEPS: {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  minPlan: PlanTier;
}[] = [
  {
    key: "people",
    label: "People",
    description: "Spokespersons with their own voice, photo, and social accounts",
    href: "people",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
    minPlan: "free",
  },
  {
    key: "strategy",
    label: "Content Strategy",
    description: "Upload your content strategy to drive automated generation",
    href: "strategy",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    minPlan: "agency",
  },
  {
    key: "schedule",
    label: "Posting Schedule",
    description: "Define which post types go on which days and times",
    href: "schedule",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    minPlan: "pro",
  },
  {
    key: "topics",
    label: "Topic Bank",
    description: "Import topics that feed into your weekly content",
    href: "topics",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    minPlan: "pro",
  },
  {
    key: "signoffs",
    label: "Sign-offs and CTAs",
    description: "Set your standard sign-off text and first comment templates",
    href: "signoffs",
    icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
    minPlan: "free",
  },
  {
    key: "urls",
    label: "Key URLs",
    description: "Destination URLs for CTAs in your content",
    href: "urls",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
    minPlan: "free",
  },
  {
    key: "social",
    label: "Company Social",
    description: "Company-level social accounts (company LinkedIn, Facebook page)",
    href: "social",
    icon: "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z",
    minPlan: "free",
  },
  {
    key: "brand_style",
    label: "Image Style",
    description: "Choose your preferred visual styles for generated images",
    href: "brand-style",
    icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    minPlan: "free",
  },
  {
    key: "api_keys",
    label: "API Keys",
    description: "Connect your AI providers for content and image generation",
    href: "api-keys",
    icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
    minPlan: "free",
  },
];

const PLAN_RANK: Record<PlanTier, number> = { free: 0, pro: 1, agency: 2 };
function hasPlanAccess(companyPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_RANK[companyPlan] >= PLAN_RANK[requiredPlan];
}

export default async function CompanyOverviewPage({ params }: PageProps) {
  const { companyId } = await params;
  const supabase = await createServerSupabaseClient();
  const profile = await getUserProfile();
  const isAdmin = profile?.role === "admin";

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  // Fetch people and completion status
  const [
    { data: people },
    { count: apiConfigCount },
    { count: socialCount },
    { count: blueprintCount },
    { count: topicCount },
    { count: weekCount },
    { count: pieceCount },
    { count: signoffCount },
    { count: urlCount },
    { count: scheduleCount },
    { count: voiceCount },
    { count: peopleCount },
  ] = await Promise.all([
    supabase.from("company_spokespersons").select("*").eq("company_id", companyId).eq("is_active", true).order("sort_order"),
    supabase.from("company_api_configs").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_social_accounts").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_blueprints").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
    supabase.from("topic_bank").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("weeks").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("content_pieces").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_signoffs").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_cta_urls").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("posting_slots").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
    supabase.from("company_voice_profiles").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
    supabase.from("company_spokespersons").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
  ]);

  // Calculate step completion
  const stepStatus: Record<string, { done: boolean; detail: string }> = {
    people: { done: (peopleCount || 0) > 0, detail: (peopleCount || 0) > 0 ? `${peopleCount} people` : "No people" },
    strategy: { done: (blueprintCount || 0) > 0, detail: (blueprintCount || 0) > 0 ? "Active" : "Not uploaded" },
    schedule: { done: (scheduleCount || 0) > 0, detail: (scheduleCount || 0) > 0 ? `${scheduleCount} slots` : "Not configured" },
    topics: { done: (topicCount || 0) > 0, detail: `${topicCount || 0} topics` },
    signoffs: { done: (signoffCount || 0) > 0, detail: (signoffCount || 0) > 0 ? "Configured" : "Not set" },
    urls: { done: (urlCount || 0) > 0, detail: `${urlCount || 0} URLs` },
    social: { done: (socialCount || 0) > 0, detail: `${socialCount || 0} connected` },
    api_keys: { done: (apiConfigCount || 0) > 0, detail: `${apiConfigCount || 0} providers` },
  };

  const companyPlan = (company.plan || "free") as PlanTier;
  const accessibleSteps = SETUP_STEPS.filter((s) => hasPlanAccess(companyPlan, s.minPlan));
  const completedSteps = accessibleSteps.filter((s) => stepStatus[s.key]?.done).length;
  const totalSteps = accessibleSteps.length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const isReadyToGenerate = completedSteps >= 4;

  // Primary spokesperson for overlay preview
  const primaryPerson = (people || []).find((p: { is_primary: boolean }) => p.is_primary) || (people || [])[0];

  // Count key strategy items for Quick Setup prominence
  const strategyItemsCompleted = [
    (voiceCount || 0) > 0,
    (topicCount || 0) > 0,
    (blueprintCount || 0) > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-8">
      {/* Quick Strategy Setup — always visible, collapsible */}
      <QuickStrategySetup
        companyId={companyId}
        companyName={company.name}
        completedItems={strategyItemsCompleted}
      />

      {/* Company Header — Company identity only */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Brand colour bar */}
        <div className="h-2" style={{ backgroundColor: company.brand_color || "#e5e7eb" }} />

        <div className="p-6">
          <div className="flex items-start gap-6">
            {/* Logos */}
            <div className="shrink-0 flex items-start gap-3">
              <div className="text-center">
                <ImageUploader
                  companyId={companyId}
                  currentUrl={company.logo_url}
                  uploadType="logo"
                  label="Logo"
                  size={80}
                />
                <p className="mt-1 text-[9px] text-gray-400">Main</p>
              </div>
              <div className="text-center">
                <ImageUploader
                  companyId={companyId}
                  currentUrl={company.overlay_logo_url}
                  uploadType="overlay_logo"
                  label="Overlay"
                  size={80}
                />
                <p className="mt-1 text-[9px] text-gray-400 max-w-[80px] leading-tight">White version for images</p>
              </div>
            </div>

            {/* Company info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
                {isAdmin ? (
                  <PlanSelector companyId={companyId} currentPlan={company.plan || "free"} />
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    company.plan === "agency"
                      ? "bg-purple-100 text-purple-700"
                      : company.plan === "pro"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {company.plan || "free"}
                  </span>
                )}
                {isReadyToGenerate && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
                    Ready to Generate
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500">{company.slug}</p>

              <div className="mt-3 flex items-center gap-4">
                {/* Brand colour */}
                <div className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: company.brand_color || "#e5e7eb" }}
                  />
                  <span className="text-xs text-gray-400">{company.brand_color || "No colour"}</span>
                </div>

                {company.blog_base_url && (
                  <span className="text-xs text-gray-400 truncate max-w-[200px]">{company.blog_base_url}</span>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="hidden sm:flex items-center gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{weekCount || 0}</p>
                <p className="text-[10px] text-gray-400 uppercase">Weeks</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{pieceCount || 0}</p>
                <p className="text-[10px] text-gray-400 uppercase">Pieces</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* People Section — Separate from company */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">People</h3>
            <p className="text-xs text-gray-500">
              Each person has their own profile, voice, and social accounts
            </p>
          </div>
          <Link
            href={`/setup/${companyId}/people`}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Manage People
          </Link>
        </div>

        {(people || []).length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(people || []).map((person: { id: string; name: string; tagline: string | null; profile_picture_url: string | null; is_primary: boolean; linkedin_url: string | null }) => (
              <Link
                key={person.id}
                href={`/setup/${companyId}/people/${person.id}`}
                className={`group rounded-lg border p-3 transition-all hover:shadow-md ${
                  person.is_primary
                    ? "border-sky-200 bg-sky-50/50 hover:border-sky-300"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Photo */}
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-gray-200">
                    {person.profile_picture_url ? (
                      <img src={person.profile_picture_url} alt={person.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs font-bold text-gray-400">
                        {person.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
                      {person.is_primary && (
                        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 shrink-0">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{person.tagline || "No tagline"}</p>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href={`/setup/${companyId}/people`}
            className="block rounded-lg border border-dashed border-gray-300 p-6 text-center hover:border-sky-300 hover:bg-sky-50/30 transition-colors"
          >
            <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">Add your first spokesperson</p>
          </Link>
        )}
      </div>

      {/* Overlay Preview */}
      <OverlayPreview
        companyId={companyId}
        hasLogo={!!company.logo_url}
        hasProfilePic={!!primaryPerson?.profile_picture_url}
        hasName={!!primaryPerson?.name}
        brandColor={company.brand_color || ""}
      />

      {/* Setup Progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Setup Progress</h3>
            <p className="text-xs text-gray-500">
              {completedSteps}/{totalSteps} steps complete
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: progressPercent === 100 ? "#22c55e" : company.brand_color || "#0ea5e9",
                }}
              />
            </div>
            <span className="text-sm font-bold" style={{ color: company.brand_color || "#0ea5e9" }}>
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Setup Steps Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {SETUP_STEPS.map((step) => {
          const status = stepStatus[step.key];
          const isDone = status?.done;
          const locked = !hasPlanAccess(companyPlan, step.minPlan);

          if (locked) {
            return (
              <div
                key={step.key}
                className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 opacity-60"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-400">{step.label}</h4>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-gray-400">
                        {step.minPlan}+
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">{step.description}</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={step.key}
              href={`/setup/${companyId}/${step.href}`}
              className={`group rounded-xl border p-4 transition-all hover:shadow-md ${
                isDone
                  ? "border-green-200 bg-green-50/50 hover:border-green-300"
                  : "border-gray-200 bg-white hover:border-sky-300"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isDone ? "bg-green-100" : "bg-gray-100 group-hover:bg-sky-100"
                  }`}
                >
                  {isDone ? (
                    <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4 text-gray-400 group-hover:text-sky-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">{step.label}</h4>
                    <span
                      className={`text-[10px] font-medium ${
                        isDone ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      {status?.detail || ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{step.description}</p>
                </div>

                {/* Arrow */}
                <svg
                  className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
