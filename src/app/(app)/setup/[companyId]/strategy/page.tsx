"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

type ImportMode = "csv" | "markdown";

interface Theme {
  id: string;
  theme_name: string;
  pillar: string | null;
  quarter: number | null;
  month: number | null;
  description: string | null;
  sort_order: number;
}

interface StrategyData {
  themes: Theme[];
  totalTopics: number;
  usedTopics: number;
  pillarCounts: Record<string, number>;
  strategyMode: string;
}

// Pillar colour mapping matches the AGENCY Bristol five-pillar model
const PILLAR_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  OA:  { bg: "bg-gray-100",    text: "text-gray-700",   border: "border-gray-200",  dot: "bg-gray-400"   },
  P1:  { bg: "bg-blue-50",     text: "text-blue-700",   border: "border-blue-200",  dot: "bg-blue-500"   },
  P2:  { bg: "bg-emerald-50",  text: "text-emerald-700",border: "border-emerald-200",dot: "bg-emerald-500"},
  P3:  { bg: "bg-purple-50",   text: "text-purple-700", border: "border-purple-200",dot: "bg-purple-500" },
  P4:  { bg: "bg-amber-50",    text: "text-amber-700",  border: "border-amber-200", dot: "bg-amber-500"  },
  P5:  { bg: "bg-rose-50",     text: "text-rose-700",   border: "border-rose-200",  dot: "bg-rose-500"   },
};

const PILLAR_LABELS: Record<string, string> = {
  OA: "Overarching",
  P1: "Getting to Market",
  P2: "Earning Attention",
  P3: "Patient Marketing",
  P4: "Events & Pipeline",
  P5: "Commercial Messaging",
};

const QUARTER_LABELS = ["", "Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dec)"];

export default function StrategyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [importMode, setImportMode] = useState<ImportMode>("csv");
  const [csvContent, setCsvContent] = useState("");
  const [markdownContent, setMarkdownContent] = useState("");
  const [strategyMode, setStrategyMode] = useState<"cohesive" | "variety">("cohesive");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [showImport, setShowImport] = useState(false);

  // Loaded strategy data
  const [strategyData, setStrategyData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStrategy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/config/strategy?companyId=${companyId}`);
      const data = await res.json();
      setStrategyData(data);
      if (data.strategyMode) {
        setStrategyMode(data.strategyMode as "cohesive" | "variety");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadStrategy();
  }, [loadStrategy]);

  const handleImport = async () => {
    setImporting(true);
    setMessage("");
    try {
      const res = await fetch("/api/config/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          format: importMode,
          content: importMode === "csv" ? csvContent : markdownContent,
          strategyMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setMessage(`Imported: ${data.themesCount || 0} themes, ${data.topicsCount || 0} topics`);
      setCsvContent("");
      setMarkdownContent("");
      setShowImport(false);
      await loadStrategy();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Group themes by quarter for organised display
  const themesByQuarter = (strategyData?.themes || []).reduce<Record<string, Theme[]>>(
    (acc, theme) => {
      const key = theme.quarter ? `Q${theme.quarter}` : "General";
      if (!acc[key]) acc[key] = [];
      acc[key].push(theme);
      return acc;
    },
    {}
  );

  const hasData =
    (strategyData?.themes?.length ?? 0) > 0 || (strategyData?.totalTopics ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Content Strategy</h2>
          <p className="mt-1 text-sm text-gray-500">
            Themes and topics that drive content generation.
          </p>
        </div>
        <button
          onClick={() => setShowImport(!showImport)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {showImport ? "Cancel" : hasData ? "+ Import More" : "+ Import Strategy"}
        </button>
      </div>

      {/* ── Import Panel ─────────────────────────────── */}
      {showImport && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 space-y-5">
          {/* Strategy Mode */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Generation Mode
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setStrategyMode("cohesive")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  strategyMode === "cohesive"
                    ? "border-sky-500 bg-white"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">Cohesive Weeks</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  One subject per week — every post type explores a single topic.
                </p>
              </button>
              <button
                onClick={() => setStrategyMode("variety")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  strategyMode === "variety"
                    ? "border-sky-500 bg-white"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">Variety</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Different topic per post — maximises coverage.
                </p>
              </button>
            </div>
          </div>

          {/* Format Toggle */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
            <button
              onClick={() => setImportMode("csv")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                importMode === "csv"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              CSV
            </button>
            <button
              onClick={() => setImportMode("markdown")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                importMode === "markdown"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Blueprint / Markdown
            </button>
          </div>

          {importMode === "csv" && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Columns:{" "}
                <code className="rounded bg-white px-1 text-xs border border-gray-200">
                  theme, subject, topic, pillar, audience_theme, priority, format, quarter
                </code>
              </p>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                rows={10}
                placeholder={`theme,topic,pillar,audience_theme,quarter\nThe Fourth Lever,12-minute meeting problem,P3,Access,1`}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}

          {importMode === "markdown" && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Paste your Company Blueprint or strategy document — Claude will extract themes and topics automatically.
              </p>
              <textarea
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                rows={10}
                placeholder="# Content Strategy&#10;&#10;## Monthly Themes&#10;### January: Why Is This Not Working?&#10;Pillars: OA + P1"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}

          {message && (
            <p
              className={`text-sm ${
                message.includes("failed") || message.includes("Error")
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {message}
            </p>
          )}

          <button
            onClick={handleImport}
            disabled={importing || (!csvContent && !markdownContent)}
            className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {importing ? "Importing..." : `Import ${importMode === "csv" ? "CSV" : "Blueprint"}`}
          </button>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────── */}
      {loading && (
        <div className="py-12 text-center text-sm text-gray-400">Loading strategy data…</div>
      )}

      {/* ── Empty State ───────────────────────────────── */}
      {!loading && !hasData && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-3 text-sm text-gray-500">No strategy imported yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Click &ldquo;+ Import Strategy&rdquo; above to get started.
          </p>
        </div>
      )}

      {/* ── Strategy Overview ─────────────────────────── */}
      {!loading && hasData && strategyData && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {(["OA", "P1", "P2", "P3", "P4", "P5"] as const)
              .filter((p) => (strategyData.pillarCounts[p] || 0) > 0)
              .map((pillar) => {
                const c = PILLAR_COLORS[pillar] || PILLAR_COLORS.OA;
                return (
                  <div
                    key={pillar}
                    className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2.5`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                      <span className={`text-[11px] font-bold ${c.text}`}>{pillar}</span>
                    </div>
                    <p className={`mt-1 text-xl font-bold ${c.text}`}>
                      {strategyData.pillarCounts[pillar] || 0}
                    </p>
                    <p className={`text-[10px] ${c.text} opacity-70`}>topics</p>
                  </div>
                );
              })}
            {/* Totals */}
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <p className="text-[11px] font-bold text-gray-500">Total</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{strategyData.totalTopics}</p>
              <p className="text-[10px] text-gray-400">
                {strategyData.usedTopics} used
              </p>
            </div>
          </div>

          {/* Generation mode badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Generation mode:</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 capitalize">
              {strategyData.strategyMode === "cohesive" ? "Cohesive Weeks" : "Variety"}
            </span>
          </div>

          {/* Themes — grouped by quarter */}
          {Object.keys(themesByQuarter).length > 0 && (
            <div className="space-y-5">
              <h3 className="text-sm font-semibold text-gray-900">
                Themes ({strategyData.themes.length})
              </h3>
              {(["Q1", "Q2", "Q3", "Q4", "General"] as const)
                .filter((q) => themesByQuarter[q]?.length > 0)
                .map((qKey) => (
                  <div key={qKey}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {qKey === "General"
                        ? "General"
                        : QUARTER_LABELS[parseInt(qKey[1])] || qKey}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {themesByQuarter[qKey].map((theme) => {
                        const pillar = theme.pillar || "OA";
                        const c = PILLAR_COLORS[pillar] || PILLAR_COLORS.OA;
                        return (
                          <div
                            key={theme.id}
                            className={`rounded-xl border ${c.border} ${c.bg} p-4`}
                          >
                            {/* Pillar badge */}
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.text}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                                {pillar}
                                {PILLAR_LABELS[pillar] ? ` · ${PILLAR_LABELS[pillar]}` : ""}
                              </span>
                            </div>
                            {/* Theme name */}
                            <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                              {theme.theme_name}
                            </h4>
                            {theme.description && (
                              <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                                {theme.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* No themes but has topics */}
          {strategyData.themes.length === 0 && strategyData.totalTopics > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {strategyData.totalTopics} topics imported directly (no theme groupings).
              See the <strong>Topics</strong> tab for the full list.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
