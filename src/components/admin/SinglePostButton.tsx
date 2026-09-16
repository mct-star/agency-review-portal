"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Queues one MCT post, for a calendar slot (slotId) or for today's slot
 * (no slotId), and follows the job until it finishes. The Mac writes the
 * post into Weekly_Outputs/Week_N/OUTPUT_WeekN_Post_<date>.md.
 */

interface JobRow {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error_message: string | null;
  output_payload: { file?: string; summary?: string } | null;
  input_payload: { slot_id?: string; post_date?: string } | null;
}

const POLL_MS = 8000;

export default function SinglePostButton({
  slotId,
  label,
  compact = false,
}: {
  slotId?: string;
  label?: string;
  compact?: boolean;
}) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedSlot = useRef<string | undefined>(slotId);

  const load = useCallback(async () => {
    const id = trackedSlot.current;
    if (!id) return;
    const res = await fetch(`/api/admin/single-post?slotIds=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const json = await res.json();
    const row = (json.data?.[id] as JobRow | undefined) ?? null;
    setJob(row);
    if (row && (row.status === "queued" || row.status === "running")) {
      timer.current = setTimeout(load, POLL_MS);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  async function write() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/single-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotId ? { slotId } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Could not queue the post.");
        if (res.status === 409 && trackedSlot.current) load();
        return;
      }
      trackedSlot.current = json.data?.slot?.id ?? slotId;
      setJob(json.data?.job ?? null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, POLL_MS);
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const active = job?.status === "queued" || job?.status === "running";
  const status =
    job?.status === "queued" ? "Queued. It starts when the Mac picks it up."
    : job?.status === "running" ? "Writing the post..."
    : job?.status === "completed" ? `Written: ${job.output_payload?.file ?? "see the week folder"}`
    : job?.status === "failed" ? (job.error_message || "The post was not written.")
    : null;

  return (
    <div className={compact ? "space-y-1 pt-1" : "space-y-1"}>
      <button
        onClick={write}
        disabled={busy || active}
        className={
          compact
            ? "rounded border border-violet-300 bg-white px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            : "rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        }
      >
        {busy ? "Queuing..." : active ? "In progress" : job?.status === "completed" ? "Write again" : label || "Write this post"}
      </button>
      {(message || status) && (
        <p className={`text-[11px] ${job?.status === "failed" || message ? "text-red-700" : job?.status === "completed" ? "text-emerald-700" : "text-amber-800"}`}>
          {message || status}
        </p>
      )}
    </div>
  );
}
