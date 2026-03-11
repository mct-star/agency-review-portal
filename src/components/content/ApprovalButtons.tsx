"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { ApprovalStatus } from "@/types/database";

interface ApprovalButtonsProps {
  pieceId: string;
  weekId: string;
  currentStatus: ApprovalStatus;
}

export default function ApprovalButtons({
  pieceId,
  weekId,
  currentStatus,
}: ApprovalButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [changeComment, setChangeComment] = useState("");
  const [showChangeForm, setShowChangeForm] = useState(false);
  const router = useRouter();

  async function handleApprove() {
    setLoading(true);
    const supabase = createClient();

    await supabase
      .from("content_pieces")
      .update({ approval_status: "approved" })
      .eq("id", pieceId);

    // Check if all pieces in the week are approved
    const { data: pieces } = await supabase
      .from("content_pieces")
      .select("approval_status")
      .eq("week_id", weekId);

    const allApproved = pieces?.every((p) => p.approval_status === "approved");

    if (allApproved) {
      await supabase
        .from("weeks")
        .update({ status: "approved" })
        .eq("id", weekId);
    }

    // Send notification
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "piece_approved",
        weekId,
        contentPieceId: pieceId,
      }),
    });

    router.refresh();
    setLoading(false);
  }

  async function handleRequestChanges() {
    if (!changeComment.trim()) return;
    setLoading(true);
    const supabase = createClient();

    await supabase
      .from("content_pieces")
      .update({ approval_status: "changes_requested" })
      .eq("id", pieceId);

    // Update week status
    await supabase
      .from("weeks")
      .update({ status: "changes_requested" })
      .eq("id", weekId);

    // Add comment
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.from("comments").insert({
        content_piece_id: pieceId,
        user_id: user.id,
        body: changeComment,
      });
    }

    // Send notification
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "changes_requested",
        weekId,
        contentPieceId: pieceId,
        comment: changeComment,
      }),
    });

    setShowChangeForm(false);
    setChangeComment("");
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Review</h3>

      {currentStatus === "approved" ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          This content has been approved
        </div>
      ) : showChangeForm ? (
        <div className="space-y-3">
          <textarea
            value={changeComment}
            onChange={(e) => setChangeComment(e.target.value)}
            placeholder="Describe the changes needed..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRequestChanges}
              disabled={loading || !changeComment.trim()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Submit Change Request"}
            </button>
            <button
              onClick={() => setShowChangeForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="rounded-lg bg-green-500 px-6 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? "..." : "Approve"}
          </button>
          <button
            onClick={() => setShowChangeForm(true)}
            className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            Request Changes
          </button>
        </div>
      )}
    </div>
  );
}
