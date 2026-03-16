"use client";

import { useEffect, useState } from "react";
import type { DistributionPlatform, ApprovalStatus, AdaptationType } from "@/types/database";
import { getPlatformCapability } from "@/lib/platform-registry";

interface Variant {
  id: string;
  content_piece_id: string;
  platform: DistributionPlatform;
  adaptation_type: AdaptationType;
  adapted_copy: string;
  adapted_first_comment: string | null;
  character_count: number | null;
  hashtags: string[];
  mentions: string[];
  thread_parts: string[] | null;
  canonical_url: string | null;
  is_selected: boolean;
  approval_status: ApprovalStatus;
  scheduled_at: string | null;
  created_at: string;
}

interface PlatformVariantsProps {
  pieceId: string;
  isAdmin: boolean;
}

const APPROVAL_STYLES: Record<ApprovalStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  changes_requested: "bg-red-100 text-red-700",
};

export default function PlatformVariants({
  pieceId,
  isAdmin,
}: PlatformVariantsProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);

  useEffect(() => {
    fetchVariants();
  }, [pieceId]);

  async function fetchVariants() {
    setLoading(true);
    const res = await fetch(`/api/variants?contentPieceId=${pieceId}`);
    const json = await res.json();
    setVariants(json.data || []);
    setLoading(false);
  }

  async function handleApprovalChange(
    variantId: string,
    status: ApprovalStatus
  ) {
    const res = await fetch("/api/variants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: variantId, approvalStatus: status }),
    });
    if (res.ok) {
      fetchVariants();
    }
  }

  async function handleToggleSelect(variantId: string, current: boolean) {
    const res = await fetch("/api/variants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: variantId, isSelected: !current }),
    });
    if (res.ok) {
      fetchVariants();
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-400">Loading variants...</p>
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          Platform Variants
        </h3>
        <p className="text-sm text-gray-400">
          No platform variants created yet. Variants are generated when
          adapting social posts for multiple channels.
        </p>
      </div>
    );
  }

  const selectedCount = variants.filter((v) => v.is_selected).length;
  const approvedCount = variants.filter(
    (v) => v.approval_status === "approved"
  ).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Platform Variants ({variants.length})
        </h3>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>{selectedCount} selected for publishing</span>
          <span>{approvedCount} approved</span>
        </div>
      </div>

      <div className="space-y-3">
        {variants.map((variant) => {
          const cap = getPlatformCapability(variant.platform);
          const config = cap
            ? { label: cap.label, icon: cap.shortLabel, maxChars: cap.maxChars, color: cap.color }
            : { label: variant.platform, icon: "?", maxChars: 3000, color: "bg-gray-100 text-gray-700" };
          const isExpanded = expandedVariant === variant.id;
          const charPercent = variant.character_count && config.maxChars
            ? Math.round((variant.character_count / config.maxChars) * 100)
            : 0;

          return (
            <div
              key={variant.id}
              className={`rounded-lg border transition-colors ${
                variant.is_selected
                  ? "border-sky-200 bg-sky-50/30"
                  : "border-gray-200"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Platform select toggle (admin only) */}
                  {isAdmin && (
                    <button
                      onClick={() =>
                        handleToggleSelect(variant.id, variant.is_selected)
                      }
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        variant.is_selected
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {variant.is_selected && (
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          />
                        </svg>
                      )}
                    </button>
                  )}

                  {/* Platform badge */}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
                  >
                    <span className="font-bold">{config.icon}</span>
                    {config.label}
                  </span>

                  {/* Char count */}
                  <span
                    className={`text-xs ${
                      charPercent > 100 ? "text-red-500 font-medium" : "text-gray-400"
                    }`}
                  >
                    {variant.character_count || variant.adapted_copy.length}/
                    {config.maxChars}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Approval badge */}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      APPROVAL_STYLES[variant.approval_status]
                    }`}
                  >
                    {variant.approval_status.replace("_", " ")}
                  </span>

                  {/* Expand toggle */}
                  <button
                    onClick={() =>
                      setExpandedVariant(isExpanded ? null : variant.id)
                    }
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? "Collapse" : "View"}
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {/* Thread parts (for thread_expand adaptation) */}
                  {variant.thread_parts && variant.thread_parts.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 mb-1">
                        Thread ({variant.thread_parts.length} parts)
                      </p>
                      <div className="space-y-2">
                        {variant.thread_parts.map((part, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-gray-200 bg-gray-50 p-3"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-400">
                                {i + 1}/{variant.thread_parts!.length}
                              </span>
                              <span className="text-xs text-gray-400">
                                {part.length} chars
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {part}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Standard adapted copy */
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 mb-1">
                        Adapted Copy
                      </p>
                      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                        {variant.adapted_copy}
                      </div>
                    </div>
                  )}

                  {/* Canonical URL (for article syndication) */}
                  {variant.canonical_url && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 mb-1">
                        Canonical URL
                      </p>
                      <a
                        href={variant.canonical_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-sky-600 hover:underline break-all"
                      >
                        {variant.canonical_url}
                      </a>
                    </div>
                  )}

                  {/* First comment */}
                  {variant.adapted_first_comment && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 mb-1">
                        First Comment
                      </p>
                      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                        {variant.adapted_first_comment}
                      </div>
                    </div>
                  )}

                  {/* Hashtags */}
                  {variant.hashtags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 mb-1">
                        Hashtags
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {variant.hashtags.map((tag, i) => (
                          <span
                            key={i}
                            className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Approval actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() =>
                        handleApprovalChange(variant.id, "approved")
                      }
                      disabled={variant.approval_status === "approved"}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        handleApprovalChange(variant.id, "changes_requested")
                      }
                      disabled={
                        variant.approval_status === "changes_requested"
                      }
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Request Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
