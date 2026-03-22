"use client";

import { useState } from "react";

const FRAMEWORKS = [
  { value: "general_healthcare", label: "General Healthcare" },
  { value: "abpi", label: "ABPI Code (UK Pharma)" },
  { value: "fda", label: "FDA (US)" },
  { value: "mhra", label: "MHRA (UK Medical Devices)" },
  { value: "eu_mdr", label: "EU MDR" },
  { value: "custom", label: "Custom" },
];

interface Props {
  companyId: string;
  currentFramework: string;
  autoReview: boolean;
}

export default function ComplianceFrameworkSelector({ companyId, currentFramework, autoReview }: Props) {
  const [framework, setFramework] = useState(currentFramework);
  const [autoRun, setAutoRun] = useState(autoReview);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/company/regulatory-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          regulatory_framework: framework,
          auto_regulatory_review: autoRun,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
      <div className="flex-1">
        <label htmlFor="framework" className="block text-sm font-medium text-gray-700 mb-1">
          Regulatory Framework
        </label>
        <select
          id="framework"
          value={framework}
          onChange={(e) => setFramework(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoRun}
          onChange={(e) => setAutoRun(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500"
        />
        <span className="text-sm text-gray-700">Auto-review new content</span>
      </label>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
