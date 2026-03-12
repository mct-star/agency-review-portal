"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Company } from "@/types/database";

interface ApprovedPiece {
  id: string;
  title: string;
  content_type: string;
  approval_status: string;
  week_id: string;
  week?: { week_number: number };
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
};

export default function PublishPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [pieces, setPieces] = useState<ApprovedPiece[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!selectedCompanyId) {
      setPieces([]);
      return;
    }
    setLoading(true);
    fetch(`/api/publish/approved?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((json) => setPieces(json.data || []))
      .catch(() => setPieces([]))
      .finally(() => setLoading(false));
  }, [selectedCompanyId]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Publish Content</h1>

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

      {/* Approved pieces */}
      {selectedCompanyId && (
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
            <div className="space-y-2">
              {pieces.map((piece) => (
                <div
                  key={piece.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {piece.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {CONTENT_TYPE_LABELS[piece.content_type] || piece.content_type}{" "}
                      · Week {(piece.week as { week_number: number } | undefined)?.week_number || "?"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Approved
                    </span>
                    <Link
                      href={`/content/${piece.id}`}
                      className="text-xs text-sky-600 hover:text-sky-800"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Publishing coming soon notice */}
          <div className="mt-6 rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
            <p className="text-xs text-gray-500">
              Direct publishing to WordPress, Wix, Metricool, and social platforms coming in Phase 8.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
