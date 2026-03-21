"use client";

import { useState } from "react";

interface QuickStrategySetupProps {
  companyId: string;
  companyName: string;
  /** Number of setup items completed (used to determine prominent vs collapsed state) */
  completedItems?: number;
}

type SetupState = "idle" | "loading" | "success" | "error";

export default function QuickStrategySetup({
  companyId,
  companyName,
  completedItems = 0,
}: QuickStrategySetupProps) {
  const isMostlyComplete = completedItems >= 3;
  const [isExpanded, setIsExpanded] = useState(!isMostlyComplete);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [state, setState] = useState<SetupState>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    personName: string;
    personTagline: string | null;
    personPhoto: string | null;
    companyLogo: string | null;
    brandColor: string | null;
  } | null>(null);

  async function handleQuickSetup() {
    if (!linkedinUrl.trim()) return;
    setState("loading");
    setError("");
    setProgress("Scanning LinkedIn profile...");

    try {
      const res = await fetch("/api/setup/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          linkedinUrl: linkedinUrl.trim(),
          websiteUrl: websiteUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Setup failed");
      }

      const data = await res.json();
      setResult(data.enrichedData);
      setState("success");

      // Reload the page to show updated setup
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  if (state === "success" && result) {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-3 text-lg font-semibold text-green-800">Profile enriched</h3>
        <p className="mt-1 text-sm text-green-600">
          {result.personName} has been set up as the primary spokesperson.
          {result.companyLogo && " Company logo imported."}
          {result.brandColor && " Brand colour detected."}
        </p>
        <p className="mt-2 text-xs text-green-500">Refreshing page...</p>
      </div>
    );
  }

  // Collapsed state for mostly-complete setups
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full rounded-xl border border-gray-200 bg-white px-6 py-4 text-left transition-all hover:border-violet-200 hover:bg-violet-50/30"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100">
              <svg className="h-4 w-4 text-violet-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Quick Strategy Setup</h3>
              <p className="text-xs text-gray-500">Paste two URLs to auto-populate your content strategy</p>
            </div>
          </div>
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${isMostlyComplete ? "border-gray-200 bg-white" : "border-dashed border-violet-200 bg-gradient-to-br from-violet-50 to-white"} p-8`}>
      <div className="mx-auto max-w-lg">
        <div className="text-center relative">
          {/* Collapse button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
            title="Collapse"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <svg className="h-6 w-6 text-violet-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-gray-900">Quick Strategy Setup</h3>
          <p className="mt-1 text-sm text-gray-500">
            Paste two URLs to auto-populate your content strategy
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname or https://linkedin.com/company/yourcompany"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-400">We'll extract your name, photo, tagline, and company</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Website
            </label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-400">We'll detect your logo, brand colours, and company description</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleQuickSetup}
            disabled={!linkedinUrl.trim() || state === "loading"}
            className="w-full rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "loading" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {progress}
              </span>
            ) : (
              "Start Setup"
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            You can always edit everything afterwards
          </p>
        </div>
      </div>
    </div>
  );
}
