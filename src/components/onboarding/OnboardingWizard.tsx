"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Onboarding Wizard — 3-step guided setup for new users
 *
 * Shows when a user has no company configured. Guides them through:
 * 1. Brand Setup — company name, website, LinkedIn URL
 * 2. Voice Setup — LinkedIn scan or paste writing samples
 * 3. First Post — generates their first post with Quick Generate
 *
 * After completion, redirects to the full dashboard.
 */

interface OnboardingWizardProps {
  userId: string;
  userName?: string;
}

export default function OnboardingWizard({ userId, userName }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Brand
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [spokespersonName, setSpokespersonName] = useState(userName || "");
  const [industry, setIndustry] = useState("");

  // Step 2: Voice
  const [voiceLinkedinUrl, setVoiceLinkedinUrl] = useState("");
  const [writingSamples, setWritingSamples] = useState("");
  const [scanningVoice, setScanningVoice] = useState(false);
  const [voiceScanned, setVoiceScanned] = useState(false);

  // Created IDs
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [spokespersonId, setSpokespersonId] = useState<string | null>(null);

  // ── Step 1: Create company + spokesperson ──────────────────

  async function handleStep1() {
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // Create company + spokesperson in one call
      const compRes = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          websiteUrl: websiteUrl.trim() || null,
          spokespersonName: spokespersonName.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          industry: industry || null,
        }),
      });
      if (!compRes.ok) {
        const data = await compRes.json();
        throw new Error(data.error || "Failed to create company");
      }
      const compData = await compRes.json();
      setCompanyId(compData.id);
      setSpokespersonId(compData.spokespersonId || null);

      // Pre-fill voice LinkedIn URL if provided
      if (linkedinUrl.trim()) {
        setVoiceLinkedinUrl(linkedinUrl.trim());
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  // ── Step 2: Scan voice ─────────────────────────────────────

  async function handleScanVoice() {
    if (!voiceLinkedinUrl.trim() && !writingSamples.trim()) {
      setStep(3); // Skip voice if nothing provided
      return;
    }

    setScanningVoice(true);
    setError(null);

    try {
      const requestBody = voiceLinkedinUrl.trim()
        ? { companyId, linkedinUrl: voiceLinkedinUrl.trim() }
        : { companyId, posts: writingSamples.trim(), isDocument: false };

      const res = await fetch("/api/setup/scan-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          // Save the voice profile
          await fetch("/api/config/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              spokespersonId: spokespersonId || undefined,
              ...data.profile,
              source: voiceLinkedinUrl ? "linkedin_scan" : "manual_paste",
            }),
          });
          setVoiceScanned(true);
        }
      }

      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice scan failed");
    } finally {
      setScanningVoice(false);
    }
  }

  // ── Step 3: Go to Quick Generate ───────────────────────────

  function handleFinish() {
    router.push(`/generate/quick`);
    router.refresh();
  }

  function handleSkipToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  // ── Progress indicator ─────────────────────────────────────

  const steps = [
    { n: 1, label: "Your Brand" },
    { n: 2, label: "Your Voice" },
    { n: 3, label: "First Post" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-xs font-semibold text-violet-700 mb-4">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
          </svg>
          Quick Setup
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {step === 1 && "Let's set up your brand"}
          {step === 2 && "Now let's capture your voice"}
          {step === 3 && "You're ready to create"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {step === 1 && "This takes under a minute. We'll use this to personalise your content."}
          {step === 2 && "Paste your LinkedIn URL and we'll learn how you write. Or skip this for now."}
          {step === 3 && "Your brand is set up. Generate your first post or explore the dashboard."}
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-center gap-3 mb-10">
        {steps.map((s) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                s.n < step
                  ? "bg-green-500 text-white"
                  : s.n === step
                  ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {s.n < step ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                s.n
              )}
            </div>
            <span
              className={`text-xs font-medium ${
                s.n === step ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {s.n < 3 && (
              <div className={`h-px w-8 ${s.n < step ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── STEP 1: Brand ──────────────────────────────────── */}
      {step === 1 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company name *</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. AGENCY Bristol"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input
              type="text"
              value={spokespersonName}
              onChange={(e) => setSpokespersonName(e.target.value)}
              placeholder="e.g. Michael Colling-Tuck"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your LinkedIn URL</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-400">We'll pull your photo and tagline automatically</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourcompany.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Select industry...</option>
                <option value="healthcare">Healthcare / Life Sciences</option>
                <option value="pharma">Pharmaceuticals / Medical Devices</option>
                <option value="fintech">Fintech / Financial Services</option>
                <option value="saas">SaaS / Technology</option>
                <option value="construction">Construction / Property</option>
                <option value="legal">Legal / Professional Services</option>
                <option value="education">Education / Training</option>
                <option value="hospitality">Hospitality / Leisure</option>
                <option value="manufacturing">Manufacturing / Engineering</option>
                <option value="retail">Retail / E-commerce</option>
                <option value="energy">Energy / Sustainability</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleStep1}
            disabled={saving || !companyName.trim()}
            className="w-full rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Setting up...
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      )}

      {/* ── STEP 2: Voice ──────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">
          <div className="rounded-lg bg-violet-50 p-4 border border-violet-100">
            <p className="text-sm text-violet-800 font-medium">Why does voice matter?</p>
            <p className="text-xs text-violet-600 mt-1">
              Every post will sound like you wrote it. We analyse your vocabulary, sentence structure,
              and signature phrases to create a unique voice profile.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL to scan</label>
            <input
              type="url"
              value={voiceLinkedinUrl}
              onChange={(e) => setVoiceLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-400">We'll read your recent posts to learn your style</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paste 3-5 writing samples</label>
            <textarea
              value={writingSamples}
              onChange={(e) => setWritingSamples(e.target.value)}
              placeholder="Paste LinkedIn posts, articles, or any writing that sounds like you..."
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleScanVoice}
              disabled={scanningVoice}
              className="flex-1 rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {scanningVoice ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analysing your voice...
                </span>
              ) : (
                "Scan my voice"
              )}
            </button>
            <button
              onClick={() => setStep(3)}
              className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: First Post ─────────────────────────────── */}
      {step === 3 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm space-y-6">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
              <svg className="h-8 w-8 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">You're all set!</h2>
            <p className="mt-1 text-sm text-gray-500">
              Your brand is configured{voiceScanned ? " and we've captured your voice" : ""}.
              Ready to create your first post?
            </p>
          </div>

          <div className="grid gap-3">
            <button
              onClick={handleFinish}
              className="w-full rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
                </svg>
                Generate my first post
              </span>
            </button>

            <button
              onClick={handleSkipToDashboard}
              className="w-full rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Go to dashboard
            </button>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Tip:</span> You can always refine your setup later
              in Settings. Add a logo, upload compliance documents, connect LinkedIn for one-click publishing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
