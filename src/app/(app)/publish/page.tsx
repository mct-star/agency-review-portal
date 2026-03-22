"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import type { Company, ContentType } from "@/types/database";
import { getPlatformsForContentType } from "@/lib/platform-registry";

interface ApprovedPiece {
  id: string;
  title: string;
  content_type: string;
  approval_status: string;
  week_id: string;
  week?: { week_number: number; date_start?: string };
}

interface PublishingJobRow {
  id: string;
  target_platform: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  external_url: string | null;
  error_message: string | null;
  created_at: string;
  company?: { name: string };
  content_piece?: { title: string; content_type: string };
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin_personal: "LinkedIn (Personal)",
  linkedin_company: "LinkedIn (Company)",
  twitter: "Twitter/X",
  bluesky: "Bluesky",
  threads: "Threads",
  facebook: "Facebook",
  instagram: "Instagram",
  wordpress: "WordPress",
  wix: "Wix",
  shopify: "Shopify",
};

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-700",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

interface LinkedInAccount {
  id: string;
  account_name: string;
  account_id: string;
  token_expires_at: string | null;
}

export default function PublishPage() {
  const searchParams = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [pieces, setPieces] = useState<ApprovedPiece[]>([]);
  const [jobs, setJobs] = useState<PublishingJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [activeTab, setActiveTab] = useState<"ready" | "queue">("ready");
  const [linkedInAccount, setLinkedInAccount] = useState<LinkedInAccount | null>(null);
  const [publishingPieceId, setPublishingPieceId] = useState<string | null>(null);
  const [linkedInNotice, setLinkedInNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Detect OAuth redirect notices (?linkedin_connected=1 or ?linkedin_error=...)
  useEffect(() => {
    const connected = searchParams.get("linkedin_connected");
    const error = searchParams.get("linkedin_error");
    if (connected) {
      setLinkedInNotice({ type: "success", message: "LinkedIn connected successfully." });
    } else if (error) {
      setLinkedInNotice({ type: "error", message: `LinkedIn error: ${decodeURIComponent(error)}` });
    }
  }, [searchParams]);

  // Fetch companies on mount
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((json) => {
        setCompanies(json.data || []);
        if (json.data?.length === 1) {
          setSelectedCompanyId(json.data[0].id);
        }
      });
  }, []);

  // Fetch LinkedIn connection status when company changes
  useEffect(() => {
    if (!selectedCompanyId) { setLinkedInAccount(null); return; }
    fetch(`/api/publish/social-accounts?companyId=${selectedCompanyId}&platform=linkedin_personal`)
      .then((r) => r.json())
      .then((json) => setLinkedInAccount(json.account || null))
      .catch(() => setLinkedInAccount(null));
  }, [selectedCompanyId]);

  const fetchData = useCallback(() => {
    if (!selectedCompanyId) {
      setPieces([]);
      setJobs([]);
      return;
    }

    setLoading(true);
    setLoadingJobs(true);

    fetch(`/api/publish/approved?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((json) => setPieces(json.data || []))
      .catch(() => setPieces([]))
      .finally(() => setLoading(false));

    fetch(`/api/publish/jobs?companyId=${selectedCompanyId}&limit=50`)
      .then((r) => r.json())
      .then((json) => setJobs(json.data || []))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, [selectedCompanyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleQueueJob(
    pieceId: string,
    targetPlatform: string
  ) {
    try {
      const res = await fetch("/api/publish/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          contentPieceId: pieceId,
          targetPlatform,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to queue job");
        return;
      }

      // Refresh data
      fetchData();
      setActiveTab("queue");
    } catch {
      alert("Failed to queue publishing job");
    }
  }

  async function handlePublishNow(pieceId: string) {
    if (!linkedInAccount) return;
    setPublishingPieceId(pieceId);
    try {
      const res = await fetch("/api/publish/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, companyId: selectedCompanyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Publishing failed");
        return;
      }
      setLinkedInNotice({
        type: "success",
        message: `Published! View on LinkedIn: ${data.post?.url || ""}`,
      });
      fetchData();
      setActiveTab("queue");
    } catch {
      alert("Network error — could not publish");
    } finally {
      setPublishingPieceId(null);
    }
  }

  const queuedCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "scheduled"
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Publish Content</h1>

      {/* LinkedIn OAuth notice */}
      {linkedInNotice && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${
          linkedInNotice.type === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <span>{linkedInNotice.message}</span>
          <button onClick={() => setLinkedInNotice(null)} className="ml-4 text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Company selector */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Select Company
        </label>
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          className="w-full max-w-xs rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
        >
          <option value="">Choose a company...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* LinkedIn connection card */}
      {selectedCompanyId && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-[#0077B5]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {linkedInAccount ? (
              <div>
                <p className="text-sm font-medium text-gray-900">Connected as {linkedInAccount.account_name}</p>
                {linkedInAccount.token_expires_at && (
                  <p className="text-xs text-gray-400">
                    Token expires {new Date(linkedInAccount.token_expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600">LinkedIn not connected for this company</p>
            )}
          </div>
          <a
            href={`/api/auth/linkedin?companyId=${selectedCompanyId}`}
            className="rounded-md bg-[#0077B5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#006097] transition-colors"
          >
            {linkedInAccount ? "Reconnect" : "Connect LinkedIn"}
          </a>
        </div>
      )}

      {selectedCompanyId && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setActiveTab("ready")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "ready"
                  ? "bg-sky-50 text-sky-700"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Ready to Publish ({pieces.length})
            </button>
            <button
              onClick={() => setActiveTab("queue")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "queue"
                  ? "bg-sky-50 text-sky-700"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Publishing Queue{" "}
              {queuedCount > 0 && (
                <span className="ml-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
                  {queuedCount}
                </span>
              )}
            </button>
          </div>

          {/* Ready to Publish tab */}
          {activeTab === "ready" && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">
                Approved Content Ready for Publishing
              </h2>
              {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : pieces.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
                  <p className="text-sm text-gray-500">
                    No approved content pieces found.
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Content needs to be approved before it can be published.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pieces.map((piece) => (
                    <div
                      key={piece.id}
                      className="rounded-md border border-gray-100 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {piece.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {CONTENT_TYPE_LABELS[piece.content_type] ||
                              piece.content_type}{" "}
                            ·{" "}
                            {formatWeekLabel(
                              (piece.week as { week_number: number; date_start?: string } | undefined)?.date_start,
                              (piece.week as { week_number: number } | undefined)?.week_number ?? 0,
                            )}
                          </p>
                        </div>
                        <Link
                          href={`/content/${piece.id}`}
                          className="text-xs text-sky-600 hover:text-sky-800"
                        >
                          View →
                        </Link>
                      </div>
                      {/* Direct LinkedIn publish — only shown when connected */}
                      {linkedInAccount && piece.content_type === "social_post" && (
                        <div className="mt-2">
                          <button
                            onClick={() => handlePublishNow(piece.id)}
                            disabled={publishingPieceId === piece.id}
                            className="flex items-center gap-1.5 rounded-md bg-[#0077B5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#006097] disabled:opacity-50 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                            {publishingPieceId === piece.id ? "Publishing..." : "Publish to LinkedIn Now"}
                          </button>
                        </div>
                      )}
                      {/* Quick queue buttons — driven by platform registry */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {/* Blog publishing platforms */}
                        {piece.content_type === "blog_article" && (
                          <>
                            {["wordpress", "wix", "shopify"].map((bp) => (
                              <button
                                key={bp}
                                onClick={() => handleQueueJob(piece.id, bp)}
                                className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                              >
                                Queue → {bp.charAt(0).toUpperCase() + bp.slice(1)}
                              </button>
                            ))}
                          </>
                        )}
                        {/* Distribution platforms from registry */}
                        {getPlatformsForContentType(
                          piece.content_type as ContentType
                        )
                          .slice(0, 6)
                          .map((cap) => (
                            <button
                              key={cap.platform}
                              onClick={() =>
                                handleQueueJob(piece.id, cap.platform)
                              }
                              className={`rounded px-2 py-1 text-xs ${cap.color} hover:opacity-80`}
                            >
                              → {cap.shortLabel}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Publishing Queue tab */}
          {activeTab === "queue" && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Publishing Queue
                </h2>
                <button
                  onClick={fetchData}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Refresh
                </button>
              </div>
              {loadingJobs ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : jobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
                  <p className="text-sm text-gray-500">
                    No publishing jobs yet.
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Queue approved content from the &quot;Ready to Publish&quot; tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between rounded-md border border-gray-100 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {job.content_piece?.title || "Unknown piece"}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span>
                            →{" "}
                            {PLATFORM_LABELS[job.target_platform] ||
                              job.target_platform}
                          </span>
                          {job.scheduled_for && (
                            <span>
                              Scheduled:{" "}
                              {new Date(job.scheduled_for).toLocaleString()}
                            </span>
                          )}
                          {job.published_at && (
                            <span>
                              Published:{" "}
                              {new Date(job.published_at).toLocaleString()}
                            </span>
                          )}
                          {job.error_message && (
                            <span className="text-red-500 truncate max-w-xs">
                              {job.error_message}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[job.status] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {job.status}
                        </span>
                        {job.external_url && (
                          <a
                            href={job.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-600 hover:text-sky-800"
                          >
                            View →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Integration notice */}
              <div className="mt-6 rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-500">
                  Jobs are currently queued only. Direct API publishing to WordPress, Wix, Metricool and social platforms requires provider configuration in company settings.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
