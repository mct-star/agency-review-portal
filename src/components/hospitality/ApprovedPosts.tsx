"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ApprovedPiece {
  id: string;
  label: string;
  whenLabel: string;
  snippet: string;
}

/** Approved posts, collapsed. Each can be put back to a draft to change it. */
export default function ApprovedPosts({ pieces }: { pieces: ApprovedPiece[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [back, setBack] = useState<Set<string>>(new Set());

  async function unapprove(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/hospitality/pieces/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "unapprove" }) });
    setBusy(null);
    if (!res.ok) { setError("That did not work. Please try again."); return; }
    setBack((s) => new Set(s).add(id));
    router.refresh();
  }

  if (pieces.length === 0) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-base font-semibold text-gray-900">Approved this week ({pieces.length})</summary>
      <div className="space-y-2 border-t border-gray-100 p-4">
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <ul className="space-y-3">
          {pieces.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-700">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900">{p.label}, {p.whenLabel}</span>
                <span className="block truncate text-gray-600">{p.snippet}</span>
              </span>
              {back.has(p.id) ? (
                <span className="text-gray-600">Back to a draft</span>
              ) : (
                <button disabled={busy === p.id} onClick={() => unapprove(p.id)} className="min-h-[44px] rounded-md border border-gray-300 px-4 py-3 text-base text-gray-800 hover:bg-gray-50 disabled:opacity-50">Unapprove</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
