"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

type ImportMode = "csv" | "markdown";

export default function StrategyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [importMode, setImportMode] = useState<ImportMode>("csv");
  const [csvContent, setCsvContent] = useState("");
  const [markdownContent, setMarkdownContent] = useState("");
  const [strategyMode, setStrategyMode] = useState<"cohesive" | "variety">("cohesive");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Content Strategy</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload your content strategy to drive automatic content generation. Import as CSV (structured) or markdown (narrative).
        </p>
      </div>

      {/* Strategy Mode */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Generation Mode</h3>
        <p className="mt-1 text-xs text-gray-500">
          How should content be generated each week?
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setStrategyMode("cohesive")}
            className={`rounded-lg border p-4 text-left transition-colors ${
              strategyMode === "cohesive"
                ? "border-sky-500 bg-sky-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">Cohesive Weeks</p>
            <p className="mt-1 text-xs text-gray-500">
              One subject per week. Every post type explores that subject from its own angle.
              Readers get a complete picture across the week.
            </p>
          </button>
          <button
            onClick={() => setStrategyMode("variety")}
            className={`rounded-lg border p-4 text-left transition-colors ${
              strategyMode === "variety"
                ? "border-sky-500 bg-sky-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">Variety</p>
            <p className="mt-1 text-xs text-gray-500">
              Different topic per post. Good for companies with diverse product lines
              or who want maximum topic coverage.
            </p>
          </button>
        </div>
      </div>

      {/* Import Mode Toggle */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setImportMode("csv")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            importMode === "csv"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          CSV Import
        </button>
        <button
          onClick={() => setImportMode("markdown")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            importMode === "markdown"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Markdown / Blueprint
        </button>
      </div>

      {/* CSV Import */}
      {importMode === "csv" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Paste CSV with columns: <code className="rounded bg-gray-100 px-1 text-xs">theme, subject, topic, pillar, audience_theme, priority, format, quarter</code>
          </p>
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={12}
            placeholder="theme,subject,topic,pillar,audience_theme,priority,format,quarter
The Fourth Lever,Patient referral pathways,12-minute meeting problem,P3,Access,High,social_post,Q1
..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
      )}

      {/* Markdown Import */}
      {importMode === "markdown" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Paste your Company Blueprint or content strategy document. Claude will analyse it to extract themes, subjects, topics, and pillars.
          </p>
          <textarea
            value={markdownContent}
            onChange={(e) => setMarkdownContent(e.target.value)}
            rows={12}
            placeholder="# Content Strategy

## Monthly Themes
### January: Why Is This Not Working?
Pillars: OA + P1
..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.includes("failed") || message.includes("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={importing || (!csvContent && !markdownContent)}
        className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {importing ? "Importing..." : `Import ${importMode === "csv" ? "CSV" : "Markdown"}`}
      </button>
    </div>
  );
}
