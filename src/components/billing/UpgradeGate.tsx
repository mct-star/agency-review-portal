"use client";

import Link from "next/link";

/**
 * UpgradeGate — Shows a gentle upgrade prompt when a feature
 * is not available on the user's current plan.
 *
 * Wrap any Pro/Agency feature with this component. If the feature
 * is allowed, it renders children normally. If not, it shows an
 * upgrade card with the feature name and required plan.
 */

interface UpgradeGateProps {
  /** Is this feature allowed on the current plan? */
  allowed: boolean;
  /** Feature name (e.g. "Compliance Review") */
  featureName: string;
  /** Which plan unlocks this feature */
  requiredPlan: "starter" | "pro" | "agency";
  /** Company ID for the upgrade link */
  companyId: string;
  /** Children to render when allowed */
  children: React.ReactNode;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter (£30/mo)",
  pro: "Pro (£99/mo)",
  agency: "Agency (£299/mo)",
};

const PLAN_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  starter: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-900", accent: "bg-gray-900" },
  pro: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-900", accent: "bg-violet-600" },
  agency: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-900", accent: "bg-purple-700" },
};

export default function UpgradeGate({
  allowed,
  featureName,
  requiredPlan,
  companyId,
  children,
}: UpgradeGateProps) {
  if (allowed) {
    return <>{children}</>;
  }

  const colors = PLAN_COLORS[requiredPlan] || PLAN_COLORS.pro;

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-8 text-center`}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
        <svg className="h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h3 className={`mt-4 text-lg font-bold ${colors.text}`}>
        {featureName}
      </h3>
      <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
        This feature is available on the {PLAN_LABELS[requiredPlan]} plan and above.
        Upgrade to unlock {featureName.toLowerCase()} and more.
      </p>
      <Link
        href={`/setup/${companyId}#billing`}
        className={`mt-5 inline-flex items-center gap-2 rounded-lg ${colors.accent} px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-all`}
      >
        View plans
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
