"use client";

import { useState } from "react";

export default function PollButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    polled: number;
    errors: number;
    total: number;
    message?: string;
  } | null>(null);

  async function handlePoll() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analytics/poll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResult({ polled: 0, errors: 1, total: 0, message: data.error || "Failed" });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ polled: 0, errors: 1, total: 0, message: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handlePoll}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Polling LinkedIn...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Poll Now
          </>
        )}
      </button>
      {result && (
        <span className="text-sm text-gray-600">
          {result.message
            ? result.message
            : `Polled ${result.polled} of ${result.total} posts${result.errors > 0 ? ` (${result.errors} errors)` : ""}`}
        </span>
      )}
    </div>
  );
}
