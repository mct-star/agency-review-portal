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
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `failed (${res.status})`);
      }
      setResult(newStatus === "approved" ? "Approved" : "Changes requested");
      setStatus("done");
    } catch (err) {
      // Say so: a silent reset looks like nothing happened, or like it worked.
      setResult(`Not saved: ${err instanceof Error ? err.message : "failed"}`);
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <span role="status" className={`text-sm font-medium ${result === "Approved" ? "text-green-700" : "text-amber-800"}`}>
        {result}
      </span>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {result && status === "idle" && <span role="alert" className="w-full text-xs text-red-700">{result}</span>}
      <button
        type="button"
        onClick={() => handleAction("approved")}
        disabled={status !== "idle"}
        className="workspace-button"
      >
        {status === "approving" ? "Approving..." : "Approve"}
      </button>
      <button
        type="button"
        onClick={() => handleAction("changes_requested")}
        disabled={status !== "idle"}
        className="workspace-button workspace-button-secondary"
      >
        {status === "rejecting" ? "Saving..." : "Changes"}
      </button>
    </div>
  );
}
