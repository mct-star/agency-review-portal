"use client";

import { useState, useEffect } from "react";
import type { PlanTier } from "@/types/database";

interface CompanyAdmin {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  logo_url: string | null;
  brand_color: string | null;
}

const PLAN_OPTIONS: { value: PlanTier; label: string; description: string; color: string; features: string[] }[] = [
  {
    value: "free",
    label: "Free",
    description: "Single posts only, free-text subjects, one spokesperson",
    color: "bg-gray-100 text-gray-600",
    features: [
      "Single social post generation",
      "Blog article generation",
      "LinkedIn article generation",
      "Free-text topic input",
      "1 spokesperson",
      "Sign-offs and CTAs",
      "Key URLs",
      "Company social accounts",
      "API key configuration",
    ],
  },
  {
    value: "pro",
    label: "Pro",
    description: "Week generation, topic bank, posting schedule, multiple spokespersons",
    color: "bg-sky-100 text-sky-700",
    features: [
      "Everything in Free, plus:",
      "Full week generation",
      "Topic bank with subject selection",
      "Posting schedule configuration",
      "Multiple spokespersons",
      "Content calendar",
    ],
  },
  {
    value: "agency",
    label: "Agency",
    description: "Full content strategy, month generation, translation, regulatory review",
    color: "bg-purple-100 text-purple-700",
    features: [
      "Everything in Pro, plus:",
      "Full month generation (4 weeks)",
      "Content strategy upload",
      "Multi-language translation",
      "Regulatory compliance review",
      "Multi-market support",
    ],
  },
];

export default function AdminPage() {
  const [companies, setCompanies] = useState<CompanyAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedPlanView, setSelectedPlanView] = useState<PlanTier | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => {
        setCompanies(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handlePlanChange(companyId: string, newPlan: PlanTier) {
    setSaving(companyId);
    setMessage(null);
    try {
      const res = await fetch("/api/config/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, plan: newPlan }),
      });
      if (res.ok) {
        setCompanies((prev) =>
          prev.map((c) => (c.id === companyId ? { ...c, plan: newPlan } : c))
        );
        const company = companies.find((c) => c.id === companyId);
        setMessage({ type: "success", text: `${company?.name} updated to ${newPlan}` });
      } else {
        setMessage({ type: "error", text: "Failed to update plan" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    }
    setSaving(null);
  }

  const planCounts = {
    free: companies.filter((c) => (c.plan || "free") === "free").length,
    pro: companies.filter((c) => c.plan === "pro").length,
    agency: companies.filter((c) => c.plan === "agency").length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage company plans and platform permissions.
        </p>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Plan overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_OPTIONS.map((plan) => (
          <button
            key={plan.value}
            onClick={() => setSelectedPlanView(selectedPlanView === plan.value ? null : plan.value)}
            className={`rounded-xl border p-5 text-left transition-all ${
              selectedPlanView === plan.value
                ? "border-sky-400 ring-1 ring-sky-200 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${plan.color}`}>
                {plan.label}
              </span>
              <span className="text-2xl font-bold text-gray-900">{planCounts[plan.value]}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">{plan.description}</p>
          </button>
        ))}
      </div>

      {/* Feature breakdown for selected plan */}
      {selectedPlanView && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-5">
          <h3 className="text-sm font-semibold text-gray-900">
            {PLAN_OPTIONS.find((p) => p.value === selectedPlanView)?.label} Plan Features
          </h3>
          <ul className="mt-3 space-y-1.5">
            {PLAN_OPTIONS.find((p) => p.value === selectedPlanView)?.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                {feature.endsWith(":") ? (
                  <span className="text-xs font-medium text-gray-400 mt-0.5">{feature}</span>
                ) : (
                  <>
                    <svg className="h-4 w-4 shrink-0 text-sky-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Company plan management */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Plans</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-sky-600" />
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                {/* Company identity */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt={company.name}
                      className="h-8 w-8 rounded-lg object-contain border border-gray-100"
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                      style={{ backgroundColor: company.brand_color || "#94a3b8" }}
                    >
                      {company.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{company.name}</p>
                    <p className="text-[11px] text-gray-400">{company.slug}</p>
                  </div>
                </div>

                {/* Plan selector */}
                <div className="flex items-center gap-1.5">
                  {PLAN_OPTIONS.map((plan) => (
                    <button
                      key={plan.value}
                      onClick={() => handlePlanChange(company.id, plan.value)}
                      disabled={saving === company.id}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all ${
                        (company.plan || "free") === plan.value
                          ? plan.color + " ring-1 ring-offset-1 " + (
                              plan.value === "agency" ? "ring-purple-300" :
                              plan.value === "pro" ? "ring-sky-300" : "ring-gray-300"
                            )
                          : "bg-gray-50 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                      } ${saving === company.id ? "opacity-50" : ""}`}
                    >
                      {plan.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
