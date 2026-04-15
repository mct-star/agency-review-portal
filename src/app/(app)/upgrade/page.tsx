"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const PLAN_INFO: Record<string, { label: string; color: string; bgColor: string }> = {
  starter: { label: "Starter", color: "text-blue-700", bgColor: "bg-blue-100" },
  pro: { label: "Pro", color: "text-violet-700", bgColor: "bg-violet-100" },
  agency: { label: "Agency", color: "text-purple-700", bgColor: "bg-purple-100" },
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  "Content Calendar": "Plan and visualise your content across weeks and months with a drag-and-drop calendar view.",
  "Weekly Planner": "Organise each week's content with topic assignments, pillar tagging, and scheduling.",
  "Week Batch": "Generate a full week of social posts in one go, with consistent messaging across your content pillars.",
  "Compliance": "Review posts against healthcare regulatory requirements before publishing.",
  "Publish": "Publish content directly to LinkedIn and other social platforms from the dashboard.",
  "Connections": "Connect your LinkedIn, Bluesky, and other social accounts for one-click publishing.",
};

function UpgradeContent() {
  const searchParams = useSearchParams();
  const feature = searchParams.get("feature") || "this feature";
  const plan = searchParams.get("plan") || "pro";
  const planMeta = PLAN_INFO[plan] || PLAN_INFO.pro;
  const description = FEATURE_DESCRIPTIONS[feature] || `Unlock ${feature} and other powerful tools to streamline your content workflow.`;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* Lock icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          {/* Feature name */}
          <h1 className="text-center text-xl font-bold text-gray-900">{feature}</h1>

          {/* Plan badge */}
          <div className="mt-3 flex justify-center">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${planMeta.bgColor} ${planMeta.color}`}>
              Requires {planMeta.label} plan
            </span>
          </div>

          {/* Description */}
          <p className="mt-5 text-center text-sm leading-relaxed text-gray-600">
            {description}
          </p>

          {/* CTA */}
          <div className="mt-8 space-y-3">
            <Link
              href="/setup"
              className={`block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold text-white transition-colors ${
                plan === "agency"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-violet-600 hover:bg-violet-700"
              }`}
            >
              Upgrade to {planMeta.label}
            </Link>
            <button
              onClick={() => window.history.back()}
              className="block w-full rounded-lg px-4 py-2 text-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-violet-600" />
      </div>
    }>
      <UpgradeContent />
    </Suspense>
  );
}
