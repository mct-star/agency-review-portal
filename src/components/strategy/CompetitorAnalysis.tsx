"use client";

import { useState } from "react";

interface ContentMixItem {
  type: string;
  percentage: number;
  color: string;
}

interface ContentGap {
  topic: string;
  whyItMatters: string;
  suggestedPostType: string;
  suggestedAngle: string;
}

interface Strength {
  strength: string;
  counterStrategy: string;
}

interface AnalysisResult {
  competitorName: string;
  postingFrequency: string;
  contentMix: ContentMixItem[];
  topTopics: string[];
  contentGaps: ContentGap[];
  strengths: Strength[];
}

interface Props {
  companyId: string;
  companyName: string;
  industry: string;
}

export default function CompetitorAnalysis({
  companyId,
  companyName,
  industry,
}: Props) {
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleAnalyse() {
    if (!linkedInUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/strategy/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, linkedInUrl }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <label
          htmlFor="linkedin-url"
          className="block text-sm font-medium text-gray-700"
        >
          Competitor LinkedIn URL
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Paste the LinkedIn company or personal profile URL of a competitor in
          the {industry || "your"} space.
        </p>
        <div className="mt-3 flex gap-3">
          <input
            id="linkedin-url"
            type="url"
            placeholder="https://linkedin.com/in/competitor or /company/competitor"
            value={linkedInUrl}
            onChange={(e) => setLinkedInUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAnalyse();
            }}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            disabled={loading}
          />
          <button
            onClick={handleAnalyse}
            disabled={loading || !linkedInUrl.trim()}
            className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Analysing..." : "Analyse"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-12">
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-8 w-8 animate-spin text-violet-600"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm text-gray-500">
              Analysing competitor content strategy...
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Header */}
          <h2 className="text-lg font-semibold text-gray-900">
            {result.competitorName}
          </h2>

          {/* Posting Frequency + Content Mix */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Posting Frequency */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Posting Frequency
              </h3>
              <p className="mt-2 text-lg font-medium text-gray-900">
                {result.postingFrequency}
              </p>
            </div>

            {/* Content Mix */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Content Mix
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.contentMix.map((item) => (
                  <span
                    key={item.type}
                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: `${item.color}20`,
                      color: item.color,
                    }}
                  >
                    {item.type} {item.percentage}%
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Top Topics */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Top Topics
            </h3>
            <ul className="mt-3 space-y-1.5">
              {result.topTopics.map((topic, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <span className="mt-0.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
                  {topic}
                </li>
              ))}
            </ul>
          </div>

          {/* Content Gaps */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Content Gaps You Can Own
            </h3>
            <div className="mt-4 space-y-4">
              {result.contentGaps.map((gap, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-amber-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{gap.topic}</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {gap.whyItMatters}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        <span className="font-medium">Suggested format:</span>{" "}
                        {gap.suggestedPostType} &middot;{" "}
                        <span className="font-medium">Angle:</span>{" "}
                        {gap.suggestedAngle}
                      </p>
                    </div>
                    <a
                      href={`/generate/quick?topic=${encodeURIComponent(gap.topic)}`}
                      className="flex-shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      Create post &rarr;
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths to Counter */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Strengths to Counter
            </h3>
            <div className="mt-3 space-y-3">
              {result.strengths.map((s, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-gray-900">
                    {s.strength}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {s.counterStrategy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
