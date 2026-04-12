"use client";

import { useState } from "react";

interface Props {
  pieceId: string;
  companyId: string;
}

export default function InlineApproveButtons({ pieceId, companyId }: Props) {
  const [status, setStatus] = useState<"idle" | "approving" | "rejecting" | "done">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function handleAction(newStatus: "approved" | "changes_requested") {
    setStatus(newStatus === "approved" ? "approving" : "rejecting");
    try {
      const res = await fetch("/api/content/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      setResult(newStatus === "approved" ? "Approved" : "Changes requested");
      setStatus("done");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <span className={`text-xs font-medium ${result === "Approved" ? "text-green-600" : "text-amber-600"}`}>
        {result} ✓
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
      <button
        onClick={(e) => { e.preventDefault(); handleAction("approved"); }}
        disabled={status !== "idle"}
        className="rounded-lg bg-green-50 border border-green-200 px-2.5 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        {status === "approving" ? "..." : "Approve"}
      </button>
      <button
        onClick={(e) => { e.preventDefault(); handleAction("changes_requested"); }}
        disabled={status !== "idle"}
        className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
      >
        {status === "rejecting" ? "..." : "Changes"}
      </button>
    </div>
  );
}
