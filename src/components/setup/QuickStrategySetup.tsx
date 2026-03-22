"use client";

import { useState } from "react";
import VoiceDictation from "@/components/ui/VoiceDictation";

interface QuickStrategySetupProps {
  companyId: string;
  companyName: string;
  /** Number of setup items completed (used to determine prominent vs collapsed state) */
  completedItems?: number;
  /** Full setup page URL for the manual option */
  setupPageUrl?: string;
}

type SetupState = "idle" | "loading" | "success" | "error";
type SetupTab = "voice" | "urls" | "manual";

interface VoiceAnalysis {
  companyDescription: string | null;
  differentiators: string[] | null;
  targetAudience: string | null;
  industry: string | null;
  voiceCharacteristics: {
    formality: string;
    technicality: string;
    energy: string;
    notes: string | null;
  } | null;
  suggestedTopics: string[] | null;
  keyVocabulary: string[] | null;
  companyName: string | null;
  spokespersonName: string | null;
  website: string | null;
}

export default function QuickStrategySetup({
  companyId,
  companyName,
  completedItems = 0,
  setupPageUrl,
}: QuickStrategySetupProps) {
  const isMostlyComplete = completedItems >= 3;
  const [isExpanded, setIsExpanded] = useState(!isMostlyComplete);
  const [activeTab, setActiveTab] = useState<SetupTab>("voice");

  // URL setup state
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

  // Voice setup state
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceState, setVoiceState] = useState<SetupState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [voiceAnalysis, setVoiceAnalysis] = useState<VoiceAnalysis | null>(null);
  const [voiceSaving, setVoiceSaving] = useState(false);

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

  async function handleVoiceAnalyse() {
    if (!voiceTranscript.trim()) return;
    setVoiceState("loading");
    setVoiceError("");

    try {
      const res = await fetch("/api/setup/voice-analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: voiceTranscript.trim(),
          companyId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await res.json();
      setVoiceAnalysis(data.analysis);
      setVoiceState("success");
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Something went wrong");
      setVoiceState("error");
    }
  }

  async function handleVoiceSave() {
    if (!voiceAnalysis) return;
    setVoiceSaving(true);

    try {
      // Save the extracted data via the quick-strategy API
      const res = await fetch("/api/setup/quick-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          source: "voice",
          companyDescription: voiceAnalysis.companyDescription,
          differentiators: voiceAnalysis.differentiators,
          targetAudience: voiceAnalysis.targetAudience,
          industry: voiceAnalysis.industry,
          voiceCharacteristics: voiceAnalysis.voiceCharacteristics,
          suggestedTopics: voiceAnalysis.suggestedTopics,
          keyVocabulary: voiceAnalysis.keyVocabulary,
          spokespersonName: voiceAnalysis.spokespersonName,
          website: voiceAnalysis.website,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      // Reload the page to show updated setup
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Failed to save");
      setVoiceSaving(false);
    }
  }

  // Success state for URL setup
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
              <p className="text-xs text-gray-500">Tell us about your business or paste URLs to get started</p>
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
            Choose how you want to get started
          </p>
        </div>

        {/* Tab selector */}
        <div className="mt-6 flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab("voice")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              activeTab === "voice"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
            </svg>
            <span className="hidden sm:inline">Tell us</span>
          </button>
          <button
            onClick={() => setActiveTab("urls")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              activeTab === "urls"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
            </svg>
            <span className="hidden sm:inline">Paste URLs</span>
          </button>
          <button
            onClick={() => {
              if (setupPageUrl) {
                window.location.href = setupPageUrl;
              } else {
                setActiveTab("manual");
              }
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              activeTab === "manual"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span className="hidden sm:inline">Manual</span>
          </button>
        </div>

        {/* Voice tab */}
        {activeTab === "voice" && (
          <div className="mt-6 space-y-4">
            {voiceState === "success" && voiceAnalysis ? (
              /* Analysis results */
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-800">Analysis complete</span>
                  </div>
                  <p className="text-xs text-green-600">Review what we extracted and save to continue.</p>
                </div>

                {voiceAnalysis.companyDescription && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1">Company</h4>
                    <p className="text-sm text-gray-700">{voiceAnalysis.companyDescription}</p>
                  </div>
                )}

                {voiceAnalysis.targetAudience && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1">Target Audience</h4>
                    <p className="text-sm text-gray-700">{voiceAnalysis.targetAudience}</p>
                  </div>
                )}

                {voiceAnalysis.differentiators && voiceAnalysis.differentiators.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1">Differentiators</h4>
                    <ul className="list-disc list-inside space-y-0.5">
                      {voiceAnalysis.differentiators.map((d, i) => (
                        <li key={i} className="text-sm text-gray-700">{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {voiceAnalysis.voiceCharacteristics && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1">Voice Profile</h4>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                        {voiceAnalysis.voiceCharacteristics.formality}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {voiceAnalysis.voiceCharacteristics.technicality}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        {voiceAnalysis.voiceCharacteristics.energy}
                      </span>
                    </div>
                    {voiceAnalysis.voiceCharacteristics.notes && (
                      <p className="mt-1 text-xs text-gray-500">{voiceAnalysis.voiceCharacteristics.notes}</p>
                    )}
                  </div>
                )}

                {voiceAnalysis.suggestedTopics && voiceAnalysis.suggestedTopics.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1">
                      Suggested Topics ({voiceAnalysis.suggestedTopics.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceAnalysis.suggestedTopics.map((t, i) => (
                        <span key={i} className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {voiceAnalysis.keyVocabulary && voiceAnalysis.keyVocabulary.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 mb-1">Key Vocabulary</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceAnalysis.keyVocabulary.map((w, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {voiceError && (
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{voiceError}</div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setVoiceState("idle");
                      setVoiceAnalysis(null);
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Re-record
                  </button>
                  <button
                    onClick={handleVoiceSave}
                    disabled={voiceSaving}
                    className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {voiceSaving ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Saving...
                      </span>
                    ) : (
                      "Save & Continue"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Recording + transcription view */
              <>
                <div className="text-center">
                  <VoiceDictation
                    onTranscription={(text) =>
                      setVoiceTranscript((prev) => (prev ? prev + " " + text : text))
                    }
                    companyId={companyId}
                    placeholder="Tell us about your business"
                    className="justify-center"
                  />
                  <p className="mt-2 text-xs text-gray-400">
                    Tell us about your company, what you do, who you help, and what makes you different
                  </p>
                </div>

                {voiceTranscript && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Your transcript
                      </label>
                      <textarea
                        value={voiceTranscript}
                        onChange={(e) => setVoiceTranscript(e.target.value)}
                        rows={5}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                        placeholder="Your transcribed text will appear here..."
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Review and edit before analysing. You can also record again to add more.
                      </p>
                    </div>

                    {voiceError && (
                      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{voiceError}</div>
                    )}

                    <button
                      onClick={handleVoiceAnalyse}
                      disabled={!voiceTranscript.trim() || voiceState === "loading"}
                      className="w-full rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {voiceState === "loading" ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Analysing transcript...
                        </span>
                      ) : (
                        "Analyse & Setup"
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* URLs tab (existing functionality) */}
        {activeTab === "urls" && (
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
              <p className="mt-1 text-xs text-gray-400">We&apos;ll extract your name, photo, tagline, and company</p>
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
              <p className="mt-1 text-xs text-gray-400">We&apos;ll detect your logo, brand colours, and company description</p>
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
        )}

        {/* Manual tab */}
        {activeTab === "manual" && (
          <div className="mt-6 text-center space-y-4">
            <p className="text-sm text-gray-600">
              Set up your content strategy step by step with full control over every setting.
            </p>
            <a
              href={setupPageUrl || `/setup/${companyId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Open Full Setup
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
