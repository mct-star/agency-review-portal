"use client";

import { useState } from "react";

interface MetricoolExportButtonProps {
  weekId: string;
  /** If true, exports as draft (all posts). If false, only exports approved posts. */
  draft?: boolean;
  /** Optional CSS class overrides */
  className?: string;
}

/**
 * Button that triggers a download of the Metricool CSV for a given week.
 * Shows loading state during download and error state if the export fails.
 */
export default function MetricoolExportButton({
  weekId,
  draft = false,
  className,
}: MetricoolExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const url = `/api/export/metricool?weekId=${weekId}&draft=${draft}`;
      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export failed");
      }

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
      const filename = filenameMatch?.[1] || `metricool_export.csv`;

      // Create blob and trigger download
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={loading}
        className={
          className ||
          `flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
            loading
              ? "cursor-not-allowed text-gray-400"
              : "text-gray-700 hover:bg-gray-50"
          }`
        }
      >
        {/* CSV icon */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        {loading ? "Exporting..." : draft ? "Export Draft CSV" : "Export Metricool CSV"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
