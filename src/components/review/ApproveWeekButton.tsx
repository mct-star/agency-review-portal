"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  weekId: string;
  unapprovedCount: number;
}

/**
 * Approve every unapproved piece in the week in one go, through the bulk
 * approve route, which records each piece (version hash, who, when) before
 * its status changes. Approving does not publish.
 */
export default function ApproveWeekButton({ weekId, unapprovedCount }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const router = useRouter();

  async function approveWeek() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/review/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setMessage({ kind: "ok", text: `${json.approvedCount} approved. Nothing has been published.` });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: `Not saved: ${err instanceof Error ? err.message : "failed"}. Nothing was approved.` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={approveWeek} disabled={loading} className="workspace-button">
        {loading ? "Approving..." : `Approve week (${unapprovedCount} left)`}
      </button>
      {message && (
        <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-700" : "text-green-700"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
