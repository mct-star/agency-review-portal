"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companyId: string;
  pieceIds: string[];
  /** Label to show — defaults to "Review All ({count})" */
  label?: string;
}

/**
 * Batch review button — sends ALL pending piece IDs to the
 * regulatory review API in a single request. The API processes
 * them sequentially (each costs one Claude API call) and
 * persists results to the database.
 *
 * Shows progress as "Reviewing 3/12..." while running.
 */
export default function BatchReviewButton({ companyId, pieceIds, label }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const router = useRouter();

  const count = pieceIds.length;

  async function handleBatchReview() {
    if (count === 0) return;
    setRunning(true);
    setProgress(`Starting review of ${count} pieces...`);

    try {
      // Process in chunks of 5 to avoid timeouts on large batches
      const CHUNK_SIZE = 5;
      let processed = 0;

      for (let i = 0; i < pieceIds.length; i += CHUNK_SIZE) {
        const chunk = pieceIds.slice(i, i + CHUNK_SIZE);
        setProgress(`Reviewing ${processed + 1}-${Math.min(processed + chunk.length, count)} of ${count}...`);

        const res = await fetch("/api/review/regulatory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            pieceIds: chunk,
            targetCountries: ["GB"],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          setProgress(`Error at piece ${processed + 1}: ${err.error || "Review failed"}`);
          break;
        }

        processed += chunk.length;
        setProgress(`Completed ${processed} of ${count}`);
      }

      setProgress(`Done! ${processed} pieces reviewed.`);
      // Refresh the page to show updated results
      setTimeout(() => {
        router.refresh();
        setRunning(false);
        setProgress("");
      }, 1500);
    } catch (err) {
      setProgress(`Error: ${err instanceof Error ? err.message : "Review failed"}`);
      setRunning(false);
    }
  }

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {running && progress && (
        <span className="text-xs text-gray-500 animate-pulse">{progress}</span>
      )}
      <button
        onClick={handleBatchReview}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-60 transition-colors"
      >
        {running ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Reviewing...
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            {label || `Review All (${count})`}
          </>
        )}
      </button>
    </div>
  );
}
