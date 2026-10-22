"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface OnboardingWizardProps {
  userId: string;
  userName?: string;
  initialCompanyName?: string;
  initialIndustry?: string;
}

/** The first Home visit creates a workspace once, then hands off to its resumable setup. */
export default function OnboardingWizard({ userName, initialCompanyName = "", initialIndustry = "" }: OnboardingWizardProps) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [spokespersonName, setSpokespersonName] = useState(userName || "");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState(initialIndustry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: companyName.trim(), spokespersonName: spokespersonName.trim() || null, websiteUrl: websiteUrl.trim() || null, industry: industry || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.id)) {
        throw new Error(data.error || "Your workspace was not created. Try again.");
      }
      router.replace(`/setup/${data.id}/start`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your workspace was not created. Try again.");
      setSaving(false);
    }
  }

  return <div className="mx-auto max-w-2xl space-y-6 py-6 sm:py-10">
    <div>
      <p className="workspace-eyebrow">Welcome</p>
      <h1 className="workspace-title">Set up your workspace</h1>
      <p className="workspace-description">Start with your company. Then confirm your brand, choose social accounts and create a draft. You can skip optional steps and return later.</p>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <form onSubmit={createWorkspace} className="workspace-panel space-y-5 p-5 sm:p-6">
      <label className="block text-sm font-medium">Company name
        <input required autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} disabled={saving} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <label className="block text-sm font-medium">Your name
        <input autoComplete="name" value={spokespersonName} onChange={(event) => setSpokespersonName(event.target.value)} disabled={saving} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <label className="block text-sm font-medium">Website (optional)
        <input type="url" autoComplete="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} disabled={saving} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <label className="block text-sm font-medium">Industry
        <select value={industry} onChange={(event) => setIndustry(event.target.value)} disabled={saving} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="">Select industry</option>
          <option value="healthcare">Healthcare and life sciences</option>
          <option value="pharma">Pharmaceuticals and medical devices</option>
          <option value="fintech">Financial services</option>
          <option value="saas">Technology</option>
          <option value="construction">Construction and property</option>
          <option value="legal">Professional services</option>
          <option value="education">Education and training</option>
          <option value="hospitality">Hospitality and leisure</option>
          <option value="manufacturing">Manufacturing and engineering</option>
          <option value="retail">Retail</option>
          <option value="energy">Energy and sustainability</option>
          <option value="other">Other</option>
        </select>
      </label>
      <button type="submit" disabled={saving || !companyName.trim()} className="workspace-button">{saving ? "Creating workspace..." : "Create workspace"}</button>
    </form>
  </div>;
}
