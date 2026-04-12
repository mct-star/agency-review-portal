"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApproveAndPublishButtonProps {
  pieceId: string;
  companyId: string;
  weekId: string;
}

type ButtonState = "idle" | "approving" | "publishing" | "done" | "error";

/**
 * Combined "Approve & Publish to LinkedIn" button.
 * Approves the content piece, then immediately publishes to LinkedIn.
 * Only rendered when LinkedIn is connected and piece is publishable.
 */
export default function ApproveAndPublishButton({
  pieceId,
  companyId,
  weekId,
}: ApproveAndPublishButtonProps) {
  const [state, setState] = useState<ButtonState>("idle");
  const [message, setMessage] = useState("");
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const router = useRouter();

  async function handleApproveAndPublish() {
    setState("approving");
    setMessage("Approving...");

    try {
      // Step 1: Approve via the existing API endpoint
      const approveRes = await fetch("/api/content/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, status: "approved" }),
      });

      if (!approveRes.ok) {
        const data = await approveRes.json();
        throw new Error(data.error || "Approval failed");
      }

      // Step 2: Send approval notification
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "piece_approved",
          weekId,
          contentPieceId: pieceId,
        }),
      }).catch(() => {
        // Non-critical, don't block publishing
      });

      // Step 3: Publish to LinkedIn
      setState("publishing");
      setMessage("Publishing to LinkedIn...");

      const publishRes = await fetch("/api/publish/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, pieceId }),
      });

      const publishData = await publishRes.json();

      if (!publishRes.ok) {
        throw new Error(publishData.error || "Publishing failed");
      }

      setState("done");
      const url = publishData.post?.url || null;
      setPostUrl(url);
      setMessage(url ? "Approved and published!" : "Approved and published to LinkedIn!");

      // Refresh the page to reflect new status
      setTimeout(() => router.refresh(), 1500);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-green-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-green-700">{message}</span>
        </div>
        {postUrl && (
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-600 hover:underline"
          >
            View post on LinkedIn
          </a>
        )}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="text-sm text-red-700">{message}</p>
        <button
          onClick={() => {
            setState("idle");
            setMessage("");
          }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleApproveAndPublish}
      disabled={state === "approving" || state === "publishing"}
      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-60"
    >
      {state === "approving" || state === "publishing" ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>{message}</span>
        </>
      ) : (
        <>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
          </svg>
          <span>Approve &amp; Publish to LinkedIn</span>
        </>
      )}
    </button>
  );
}
