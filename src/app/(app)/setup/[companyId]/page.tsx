import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ImageUploader from "./ImageUploader";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const SETUP_STEPS = [
  {
    key: "strategy",
    label: "Content Strategy",
    description: "Upload your content strategy to drive automated generation",
    href: "strategy",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    key: "schedule",
    label: "Posting Schedule",
    description: "Define which post types go on which days and times",
    href: "schedule",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    key: "topics",
    label: "Topic Bank",
    description: "Import topics that feed into your weekly content",
    href: "topics",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  },
  {
    key: "voice",
    label: "Voice Profile",
    description: "Define or scan your writing style for authentic content",
    href: "voice",
    icon: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z",
  },
  {
    key: "signoffs",
    label: "Sign-offs and CTAs",
    description: "Set your standard sign-off text and first comment templates",
    href: "signoffs",
    icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
  },
  {
    key: "urls",
    label: "Key URLs",
    description: "Destination URLs for CTAs in your content",
    href: "urls",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  },
  {
    key: "api_keys",
    label: "API Keys",
    description: "Connect your AI providers for content and image generation",
    href: "api-keys",
    icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  },
  {
    key: "social",
    label: "Social Accounts",
    description: "Connect LinkedIn and other platforms for direct publishing",
    href: "social",
    icon: "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z",
  },
];

export default async function CompanyOverviewPage({ params }: PageProps) {
  const { companyId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  // Fetch completion status for each step
  const [
    { count: apiConfigCount },
    { count: socialCount },
    { count: blueprintCount },
    { count: topicCount },
    { count: weekCount },
    { count: pieceCount },
    { count: signoffCount },
    { count: urlCount },
  ] = await Promise.all([
    supabase.from("company_api_configs").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_social_accounts").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_blueprints").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
    supabase.from("topic_bank").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("weeks").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("content_pieces").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_signoffs").select("*", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("company_cta_urls").select("*", { count: "exact", head: true }).eq("company_id", companyId),
  ]);

  // Calculate step completion
  const stepStatus: Record<string, { done: boolean; detail: string }> = {
    strategy: { done: (blueprintCount || 0) > 0, detail: (blueprintCount || 0) > 0 ? "Active" : "Not uploaded" },
    schedule: { done: false, detail: "Configure" }, // Can't check posting_slots without migration
    topics: { done: (topicCount || 0) > 0, detail: `${topicCount || 0} topics` },
    voice: { done: false, detail: "Not configured" },
    signoffs: { done: (signoffCount || 0) > 0, detail: (signoffCount || 0) > 0 ? "Configured" : "Not set" },
    urls: { done: (urlCount || 0) > 0, detail: `${urlCount || 0} URLs` },
    api_keys: { done: (apiConfigCount || 0) > 0, detail: `${apiConfigCount || 0} providers` },
    social: { done: (socialCount || 0) > 0, detail: `${socialCount || 0} connected` },
  };

  const completedSteps = Object.values(stepStatus).filter((s) => s.done).length;
  const totalSteps = SETUP_STEPS.length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const isReadyToGenerate = completedSteps >= 4; // At least strategy, schedule, topics, API keys

  // Get initials for avatar fallback
  const initials = (company.spokesperson_name || company.name)
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Company Header with Logo + Profile */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Brand colour bar */}
        <div className="h-2" style={{ backgroundColor: company.brand_color || "#e5e7eb" }} />

        <div className="p-6">
          <div className="flex items-start gap-6">
            {/* Logo */}
            <div className="shrink-0">
              <ImageUploader
                companyId={companyId}
                currentUrl={company.logo_url}
                uploadType="logo"
                label="Logo"
                size={80}
              />
            </div>

            {/* Company info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
                {isReadyToGenerate && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
                    Ready to Generate
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500">{company.slug}</p>

              <div className="mt-3 flex items-center gap-6">
                {/* Profile Picture */}
                <div className="flex items-center gap-3">
                  <ImageUploader
                    companyId={companyId}
                    currentUrl={company.profile_picture_url}
                    uploadType="profile_picture"
                    label="Photo"
                    size={48}
                    rounded
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {company.spokesperson_name || "No spokesperson"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {company.spokesperson_tagline || "Add tagline"}
                    </p>
                  </div>
                </div>

                {/* Brand colour */}
                <div className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: company.brand_color || "#e5e7eb" }}
                  />
                  <span className="text-xs text-gray-400">{company.brand_color || "No colour"}</span>
                </div>
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
