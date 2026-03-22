"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  pieceId: string;
  companyId: string;
  weekId: string;
}

export default function ComplianceReviewButton({ pieceId, companyId, weekId }: Props) {
  const [running, setRunning] = useState(false);
  const router = useRouter();

  async function handleReview() {
    setRunning(true);
    try {
      const res = await fetch("/api/review/regulatory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          weekId,
          pieceIds: [pieceId],
          targetCountries: ["GB"],
        }),
      });

      if (res.ok) {
        router.push(`/compliance/${pieceId}`);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      onClick={handleReview}
      disabled={running}
      className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
    >
      {running ? (
        <span className="flex items-center gap-1.5">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reviewing...
        </span>
      ) : (
        "Review Now"
      )}
    </button>
  );
}
