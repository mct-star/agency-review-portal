import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ComplianceFrameworkSelector from "@/components/compliance/ComplianceFrameworkSelector";
import ComplianceReviewButton from "@/components/compliance/ComplianceReviewButton";
import BatchReviewButton from "@/components/compliance/BatchReviewButton";
import ComplianceDocuments from "@/components/compliance/ComplianceDocuments";
import { getPostDisplayName, getPostTypeBadge } from "@/lib/post-display-name";
import UpgradeGate from "@/components/billing/UpgradeGate";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { getPlanFeatures } from "@/lib/utils/plan-limits";
import type { PlanTier } from "@/types/database";

export const metadata: Metadata = {
  title: "Compliance Review | AGENCY",
  description: "Regulatory compliance review dashboard",
};

const FRAMEWORK_LABELS: Record<string, string> = {
  abpi: "ABPI Code (UK Pharma)",
  fda: "FDA (US)",
  mhra: "MHRA (UK Medical Devices)",
  eu_mdr: "EU MDR",
  general_healthcare: "General Healthcare",
  custom: "Custom",
};

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ScoreGauge({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const radius = size === "lg" ? 44 : 28;
  const viewBox = size === "lg" ? 100 : 64;
  const cx = viewBox / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#166534" : score >= 60 ? "#a16207" : score >= 40 ? "#c2410c" : "#991b1b";
  const h = size === "lg" ? "h-28 w-28" : "h-16 w-16";
  const textSize = size === "lg" ? "text-2xl" : "text-sm";

  return (
    <div className={`relative ${h}`}>
      <svg className={`${h} -rotate-90`} viewBox={`0 0 ${viewBox} ${viewBox}`}>
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={size === "lg" ? 8 : 5} />
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke={color} strokeWidth={size === "lg" ? 8 : 5} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${textSize} font-bold`} style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: "bg-green-50 text-green-700 border-green-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    critical: "bg-red-50 text-red-700 border-red-200",
    clean: "bg-green-50 text-green-700 border-green-200",
    flagged: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-gray-50 text-gray-500 border-gray-200",
    approved: "bg-blue-50 text-blue-700 border-blue-200",
  };
  const labels: Record<string, string> = {
    low: "Low Risk",
    medium: "Medium Risk",
    high: "High Risk",
    critical: "Critical",
    clean: "Clean",
    flagged: "Issues Found",
    pending: "Pending",
    approved: "Approved",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[level] || styles.pending}`}>
      {labels[level] || level}
    </span>
  );
}

function TrafficLight({ status }: { status: string }) {
  if (status === "clean" || status === "approved") {
    return <span className="inline-block h-3 w-3 rounded-full bg-green-500" title="Clean" />;
  }
  if (status === "flagged") {
    return <span className="inline-block h-3 w-3 rounded-full bg-red-500" title="Issues Found" />;
  }
  return <span className="inline-block h-3 w-3 rounded-full bg-gray-300" title="Pending" />;
}

const contentTypeLabels: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
};

const DOC_CATEGORY_LABELS: Record<string, string> = {
  claims_matrix: "Claims Matrix",
  messaging_house: "Messaging House",
  brand_guidelines: "Brand Guidelines",
  regulatory_policy: "Regulatory Policy",
  competitor_claims: "Competitor Claims",
  product_information: "Product Information",
  custom: "Other",
};

// Setup checklist item — mirrors dashboard SetupItem pattern
function SetupItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? "bg-emerald-100" : "border-2 border-amber-300"}`}>
        {done && (
          <svg className="h-3 w-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={done ? "text-gray-400 line-through" : "text-gray-700"}>{label}</span>
      {!done && (
        <svg className="ml-auto h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5l7 7-7 7" />
        </svg>
      )}
    </Link>
  );
}

export default async function ComplianceDashboardPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  // Determine company scope
  let companyId = profile.company_id;

  // For admin, show all companies or the first one with content
  let companies: { id: string; name: string; regulatory_framework: string | null; auto_regulatory_review: boolean }[] = [];
  if (isAdmin) {
    const { data } = await supabase.from("companies").select("id, name, regulatory_framework, auto_regulatory_review").order("name");
    companies = (data || []).map((c) => ({
      ...c,
      regulatory_framework: c.regulatory_framework ?? null,
      auto_regulatory_review: c.auto_regulatory_review ?? false,
    }));
    if (!companyId && companies.length > 0) {
      companyId = companies[0].id;
    }
  } else if (companyId) {
    const { data } = await supabase.from("companies").select("id, name, regulatory_framework, auto_regulatory_review").eq("id", companyId).single();
    if (data) {
      companies = [{
        ...data,
        regulatory_framework: data.regulatory_framework ?? null,
        auto_regulatory_review: data.auto_regulatory_review ?? false,
      }];
    }
  }

  if (!companyId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <ShieldIcon className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">No company assigned. Contact an admin.</p>
        </div>
      </div>
    );
  }

  // Plan check — compliance review is Pro+ only
  if (!isAdmin) {
    const { data: planData } = await supabase
      .from("companies")
      .select("plan, trial_plan, trial_expires_at")
      .eq("id", companyId)
      .single();
    if (planData) {
      const effectivePlan = getEffectivePlan(planData as { plan: PlanTier; trial_plan?: PlanTier | null; trial_expires_at?: string | null });
      const features = getPlanFeatures(effectivePlan);
      if (!features.complianceReview) {
        return (
          <div className="p-6">
            <UpgradeGate
              allowed={false}
              featureName="Regulatory Compliance Review"
              requiredPlan="pro"
              companyId={companyId}
            >
              <div />
            </UpgradeGate>
          </div>
        );
      }
    }
  }

  const currentCompany = companies.find((c) => c.id === companyId);
  const activeFramework = currentCompany?.regulatory_framework || "general_healthcare";

  // Setup status checks
  const frameworkConfigured =
    !!currentCompany?.regulatory_framework &&
    currentCompany.regulatory_framework !== "general" &&
    currentCompany.regulatory_framework !== "general_healthcare";

  // Fetch compliance documents for setup check and category breakdown
  const { data: complianceDocs } = await supabase
    .from("company_compliance_documents")
    .select("id, category")
    .eq("company_id", companyId);

  const docs = complianceDocs || [];
  const docsUploaded = docs.length > 0;
  const setupComplete = frameworkConfigured && docsUploaded;

  // Group docs by category
  const docsByCategory = docs.reduce<Record<string, number>>((acc, d) => {
    const key = d.category || "custom";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const frameworkSetupHref = `/setup/${companyId}`;
  const docsUploadHref = `/compliance#compliance-documents`;

  // Fetch all content pieces for this company
  const { data: allPieces } = await supabase
    .from("content_pieces")
    .select("id, title, content_type, post_type, day_of_week, regulatory_status, regulatory_score, regulatory_review, regulatory_framework, regulatory_reviewed_at, created_at, week_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const pieces = allPieces || [];

  // Summary stats
  const reviewed = pieces.filter((p) => p.regulatory_status && p.regulatory_status !== "pending");
  const flagged = pieces.filter((p) => p.regulatory_status === "flagged");
  const clean = pieces.filter((p) => p.regulatory_status === "clean" || p.regulatory_status === "approved");
  const pending = pieces.filter((p) => !p.regulatory_status || p.regulatory_status === "pending");
  const approved = pieces.filter((p) => p.regulatory_status === "approved");

  // Average score of reviewed pieces
  const scoredPieces = pieces.filter((p) => p.regulatory_score != null);
  const avgScore = scoredPieces.length > 0
    ? Math.round(scoredPieces.reduce((sum, p) => sum + (p.regulatory_score || 0), 0) / scoredPieces.length)
    : 0;

  // Recently reviewed (last 20)
  const recentlyReviewed = pieces
    .filter((p) => p.regulatory_reviewed_at)
    .slice(0, 20);

  // Awaiting review (last 20)
  const awaitingReview = pending.slice(0, 20);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-800 p-2">
            <ShieldCheckIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Regulatory Compliance</h1>
            <p className="text-sm text-gray-500">
              Content compliance review and audit trail for regulated industries
            </p>
          </div>
        </div>
      </div>

      {/* Compliance framing */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Built for regulated industries</h2>
            <p className="mt-1 text-sm text-gray-600 max-w-2xl">
              Every post is reviewed against your chosen regulatory framework before it goes live.
              Our three-colour system maps each sentence to Legal, Regulatory, or Compliance responsibilities —
              the same structure pharmaceutical MLR teams use. No post leaves this platform without a compliance score.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Legal
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Regulatory
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Compliance
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Setup Status */}
      {setupComplete ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
              <ShieldCheckIcon className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">Compliance setup complete</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                Framework: {FRAMEWORK_LABELS[activeFramework] || activeFramework}. {docs.length}{" "}
                document{docs.length === 1 ? "" : "s"} uploaded.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex items-center gap-3 border-b border-amber-200/60 px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-5 w-5 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Complete your compliance setup</p>
              <p className="mt-0.5 text-xs text-amber-800">
                Finish these steps to unlock accurate regulatory reviews
              </p>
            </div>
          </div>
          <div className="px-3 py-3 space-y-1">
            <SetupItem
              done={frameworkConfigured}
              label="Regulatory framework configured"
              href={frameworkSetupHref}
            />
            <SetupItem
              done={docsUploaded}
              label="Compliance documents uploaded"
              href={docsUploadHref}
            />
          </div>
        </div>
      )}

      {/* Compliance Documents overview (only when setup is complete) */}
      {setupComplete && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Compliance Documents</h2>
                <p className="text-xs text-gray-500">
                  {docs.length} document{docs.length === 1 ? "" : "s"} powering reviews
                </p>
              </div>
            </div>
            <Link
              href={docsUploadHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Upload more
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(DOC_CATEGORY_LABELS).map(([key, label]) => {
              const count = docsByCategory[key] || 0;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                >
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      count > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {reviewed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center">
          <p className="text-sm font-medium text-emerald-800">No posts reviewed yet</p>
          <p className="mt-1 text-xs text-emerald-600">Generate some content first, then come back here to run compliance checks before publishing.</p>
          <Link href="/generate/quick" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
            Create your first post
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-800">{reviewed.length}</p>
                <p className="mt-1 text-sm text-gray-500">Total Reviewed</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <ShieldIcon className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-red-700">{flagged.length}</p>
                <p className="mt-1 text-sm text-gray-500">Issues Found</p>
              </div>
              <div className="rounded-lg bg-red-50 p-2">
                <svg className="h-5 w-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-green-700">{clean.length}</p>
                <p className="mt-1 text-sm text-gray-500">Clean / Approved</p>
              </div>
              <div className="rounded-lg bg-green-50 p-2">
                <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-400">{pending.length}</p>
                <p className="mt-1 text-sm text-gray-500">Awaiting Review</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10a1 1 0 0 1-.3.7l-3 3-1.4-1.4L11 11.58V6h2v6Z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-800 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-white">{scoredPieces.length > 0 ? avgScore : "--"}</p>
                <p className="mt-1 text-sm text-slate-300">Avg. Score</p>
              </div>
              <div className="rounded-lg bg-slate-700 p-2">
                <svg className="h-5 w-5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.5 18.5l13-13" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Framework Configuration */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <ShieldIcon className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-gray-900">Framework Configuration</h2>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <p className="text-sm text-gray-500 mb-2">Active regulatory framework for compliance reviews</p>
            <ComplianceFrameworkSelector
              companyId={companyId}
              currentFramework={activeFramework}
              autoReview={currentCompany?.auto_regulatory_review ?? false}
            />
            <p className="mt-2 text-xs text-gray-400">
              Choose the framework that matches your industry. ABPI for UK pharma. MHRA for medical devices.
              FDA for US markets. FCA for financial services. Each framework has specific rules your content will be checked against.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Current</p>
            <p className="text-sm font-medium text-slate-800">{FRAMEWORK_LABELS[activeFramework] || activeFramework}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["ABPI", "MHRA", "FDA", "EU MDR", "FCA", "MiFID II", "SRA", "ASA/CAP", "GDPR"].map(fw => (
            <span key={fw} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-600">
              {fw}
            </span>
          ))}
        </div>
      </div>

      {/* Compliance Documents */}
      <div id="compliance-documents" className="scroll-mt-6">
        <ComplianceDocuments companyId={companyId} />
      </div>

      {/* Two-column layout: Awaiting Review + Recent Reviews */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Posts Requiring Compliance Review */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Awaiting Review</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{pending.length}</span>
            </div>
            {pending.length > 0 && (
              <BatchReviewButton
                companyId={companyId}
                pieceIds={pending.map((p) => p.id)}
              />
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {awaitingReview.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldCheckIcon className="h-10 w-10 text-green-300" />
                <p className="mt-3 text-sm text-gray-500">All content has been reviewed</p>
              </div>
            ) : (
              awaitingReview.map((piece) => {
                const badge = getPostTypeBadge(piece.post_type);
                const displayName = getPostDisplayName({
                  title: piece.title,
                  postType: piece.post_type,
                  dayOfWeek: piece.day_of_week,
                  contentType: piece.content_type,
                });
                return (
                <div key={piece.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: badge.color }}
                      >
                        {badge.label}
                      </span>
                      <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 ml-[calc(1.5rem+0.5rem)]">
                      <span>{contentTypeLabels[piece.content_type] || piece.content_type}</span>
                      <span>&#183;</span>
                      <span>{new Date(piece.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ComplianceReviewButton
                    pieceId={piece.id}
                    companyId={companyId}
                    weekId={piece.week_id}
                  />
                </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Reviews */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Reviews</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{recentlyReviewed.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {recentlyReviewed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldIcon className="h-10 w-10 text-gray-200" />
                <p className="mt-3 text-sm text-gray-500">No reviews completed yet</p>
              </div>
            ) : (
              recentlyReviewed.map((piece) => {
                const badge = getPostTypeBadge(piece.post_type);
                const displayName = getPostDisplayName({
                  title: piece.title,
                  postType: piece.post_type,
                  dayOfWeek: piece.day_of_week,
                  contentType: piece.content_type,
                });
                return (
                <Link
                  key={piece.id}
                  href={`/compliance/${piece.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <TrafficLight status={piece.regulatory_status || "pending"} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: badge.color }}
                        >
                          {badge.label}
                        </span>
                        <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 ml-[calc(1.5rem+0.5rem)]">
                        <span>{contentTypeLabels[piece.content_type] || piece.content_type}</span>
                        <span>&#183;</span>
                        <span>{piece.regulatory_reviewed_at ? new Date(piece.regulatory_reviewed_at).toLocaleDateString() : ""}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {piece.regulatory_score != null && (
                      <ScoreGauge score={piece.regulatory_score} size="sm" />
                    )}
                    <RiskBadge level={piece.regulatory_status || "pending"} />
                  </div>
                </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Approved Posts */}
      {approved.length > 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50/30 shadow-sm">
          <div className="flex items-center justify-between border-b border-green-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Compliance Approved</h2>
            </div>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">{approved.length}</span>
          </div>
          <div className="divide-y divide-green-50">
            {approved.slice(0, 10).map((piece) => (
              <Link
                key={piece.id}
                href={`/compliance/${piece.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-green-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{piece.title}</p>
                    <p className="text-xs text-gray-400">{contentTypeLabels[piece.content_type] || piece.content_type}</p>
                  </div>
                </div>
                {piece.regulatory_score != null && (
                  <span className="text-sm font-semibold text-green-700">{piece.regulatory_score}/100</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
