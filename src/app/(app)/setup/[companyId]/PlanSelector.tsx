"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@/types/database";

const PLAN_OPTIONS: { value: PlanTier; label: string; color: string }[] = [
  { value: "free", label: "Free", color: "bg-gray-100 text-gray-500" },
  { value: "pro", label: "Pro", color: "bg-sky-100 text-sky-700" },
  { value: "agency", label: "Agency", color: "bg-purple-100 text-purple-700" },
];

interface PlanSelectorProps {
  companyId: string;
  currentPlan: PlanTier;
}

export default function PlanSelector({ companyId, currentPlan }: PlanSelectorProps) {
  const [plan, setPlan] = useState<PlanTier>(currentPlan);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const current = PLAN_OPTIONS.find((p) => p.value === plan) || PLAN_OPTIONS[0];

  async function handleChange(newPlan: PlanTier) {
    if (newPlan === plan) return;
    setSaving(true);
    const res = await fetch("/api/config/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, plan: newPlan }),
    });
    if (res.ok) {
      setPlan(newPlan);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="relative group">
      <select
        value={plan}
        onChange={(e) => handleChange(e.target.value as PlanTier)}
        disabled={saving}
        className={`appearance-none rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide cursor-pointer border-0 pr-6 ${current.color} ${saving ? "opacity-50" : ""}`}
      >
        {PLAN_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
