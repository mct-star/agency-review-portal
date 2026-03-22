"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RegulatoryReviewResult, RegulatoryIssueResult } from "@/types/database";

interface Props {
  pieceId: string;
  companyId: string;
  weekId: string;
  markdownBody: string;
  firstComment: string | null;
  regulatoryStatus: string;
  regulatoryScore: number | null;
  review: RegulatoryReviewResult | null;
  hasReview: boolean;
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#166534" : score >= 60 ? "#a16207" : score >= 40 ? "#c2410c" : "#991b1b";
  const bgColor = score >= 80 ? "#f0fdf4" : score >= 60 ? "#fffbeb" : score >= 40 ? "#fff7ed" : "#fef2f2";
  const label = score >= 80 ? "Compliant" : score >= 60 ? "Needs Attention" : score >= 40 ? "Concerns" : "Non-Compliant";

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36">
        <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill={bgColor} stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none" stroke={color}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-gray-500">/100</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium" style={{ color }}>{label}</p>
    </div>
  );
}

function SectionNumber({ n }: { n: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white tracking-wider mr-3">
      {n}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: "bg-green-50 text-green-700 border-green-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-red-50 text-red-700 border-red-200",
    critical: "bg-red-100 text-red-800 border-red-300",
  };
  const labels: Record<string, string> = {
    low: "Low Risk",
    medium: "Medium Risk",
    high: "High Risk",
    critical: "Critical Risk",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[level] || styles.low}`}>
      {labels[level] || level}
    </span>
  );
}

// Three-category compliance system: Legal, Regulatory, Compliance
type ComplianceCategory = "legal" | "regulatory" | "compliance";

function getComplianceCategory(category: string): ComplianceCategory {
  const legalCategories = ["medical_claim", "off_label", "misleading", "competitor_reference"];
  const regulatoryCategories = ["missing_disclaimer", "claims", "product"];
  if (legalCategories.includes(category)) return "legal";
  if (regulatoryCategories.includes(category)) return "regulatory";
  return "compliance";
}

const COMPLIANCE_COLORS: Record<ComplianceCategory, { bg: string; border: string; text: string; label: string; dot: string }> = {
  legal: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "Legal", dot: "bg-red-500" },
  regulatory: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", label: "Regulatory", dot: "bg-amber-500" },
  compliance: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", label: "Compliance", dot: "bg-blue-500" },
};

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    medical_claim: "Medical Claim",
    off_label: "Off-Label",
    misleading: "Misleading",
    missing_disclaimer: "Missing Disclaimer",
    competitor_reference: "Competitor Ref",
    brand: "Brand",
    product: "Product",
    service: "Service",
    formatting: "Formatting",
    claims: "Claims",
    audience: "Audience",
    channel: "Channel",
  };

  const compCat = getComplianceCategory(category);
  const colors = COMPLIANCE_COLORS[compCat];

  return (
    <span className={`inline-flex items-center gap-1 rounded ${colors.bg} ${colors.border} border px-2 py-0.5 text-xs font-medium ${colors.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {colors.label}: {labels[category] || category}
    </span>
  );
}

function highlightSentences(text: string, issues: RegulatoryIssueResult[]): React.ReactNode[] {
  if (!issues || issues.length === 0) {
    // All clean - wrap in green
    return [<span key="all" className="bg-green-50 rounded px-0.5">{text}</span>];
  }

  // Build a map of sentences to highlight
  const issueMap = new Map<string, RegulatoryIssueResult>();
  for (const issue of issues) {
    if (issue.sentence) {
      issueMap.set(issue.sentence.toLowerCase().trim(), issue);
    }
  }

  // Split body into sentences (rough heuristic)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const result: React.ReactNode[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const normalized = sentence.toLowerCase().trim();

    // Check if any issue sentence is a substring
    let matchedIssue: RegulatoryIssueResult | undefined;
    for (const [issueSentence, issue] of issueMap.entries()) {
      if (normalized.includes(issueSentence) || issueSentence.includes(normalized)) {
        matchedIssue = issue;
        break;
      }
    }

    if (matchedIssue) {
      const compCat = getComplianceCategory(matchedIssue.category);
      const catColors = COMPLIANCE_COLORS[compCat];
      const bgColor = `${catColors.bg} ${catColors.border}`;
      result.push(
        <span key={i} className={`${bgColor} rounded border px-0.5`}>
          {sentence}
        </span>
      );
    } else {
      result.push(
        <span key={i} className="bg-green-50/50 rounded px-0.5">
          {sentence}
        </span>
      );
    }

    if (i < sentences.length - 1) {
      result.push(<span key={`sp-${i}`}> </span>);
    }
  }

  return result;
}

export default function ComplianceDetailClient({
  pieceId,
  companyId,
  weekId,
  markdownBody,
  firstComment,
  regulatoryStatus,
  regulatoryScore,
  review,
  hasReview,
}: Props) {
  const router = useRouter();
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(regulatoryStatus);

  const issues = review?.issues || [];
  const passedChecks = review?.passedChecks || [];

  const highlightedBody = useMemo(
    () => hasReview ? highlightSentences(markdownBody, issues) : null,
    [markdownBody, issues, hasReview]
  );

  async function handleRerun() {
    setRerunning(true);
    try {
      const res = await fetch("/api/review/regulatory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          weekId,
          pieceIds: [pieceId],
          targetCountries: review?.targetCountries || ["GB"],
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setRerunning(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch("/api/company/regulatory-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId }),
      });
      if (res.ok) {
        setCurrentStatus("approved");
        router.refresh();
      }
    } finally {
      setApproving(false);
    }
  }

  if (!hasReview) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No Compliance Review Yet</h3>
        <p className="mt-2 text-sm text-gray-500">
          This content piece has not been through regulatory compliance review.
        </p>
        <button
          onClick={handleRerun}
          disabled={rerunning}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {rerunning ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running Review...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Run Compliance Review
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 01 COMPLIANCE SCORE ────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="flex items-center text-sm font-semibold text-gray-900">
            <SectionNumber n="01" />
            Compliance Score
          </h2>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handleRerun}
              disabled={rerunning}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {rerunning ? "Re-running..." : "Re-run Review"}
            </button>
            {currentStatus !== "approved" && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="rounded-lg bg-green-700 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {approving ? "Approving..." : "Approve"}
              </button>
            )}
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-8">
            <ScoreGauge score={review?.overallScore ?? 0} />
            <div>
              <div className="flex items-center gap-3 mb-2">
                <RiskBadge level={review?.riskLevel || "low"} />
                {currentStatus === "approved" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Approved
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 max-w-md">{(review as RegulatoryReviewResult & { summary?: string })?.summary || ""}</p>
              {review?.targetCountries && (
                <p className="mt-1 text-xs text-gray-400">
                  Markets: {review.targetCountries.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 02 CONTENT REVIEW ────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="flex items-center text-sm font-semibold text-gray-900">
            <SectionNumber n="02" />
            Content Review
          </h2>
        </div>
        <div className="p-6">
        <div className="prose prose-sm max-w-none leading-relaxed">
          <div className="whitespace-pre-wrap text-gray-800">
            {highlightedBody}
          </div>
          {firstComment && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">First Comment</p>
              <div className="whitespace-pre-wrap text-gray-700 text-sm">
                {highlightSentences(firstComment, issues)}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-green-50 border border-green-200" /> Clean
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-red-50 border border-red-200" /> Legal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-amber-50 border border-amber-200" /> Regulatory
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-6 rounded bg-blue-50 border border-blue-200" /> Compliance
          </span>
        </div>
        </div>
      </div>

      {/* ── 03 ISSUES FOUND ──────────────────────────────────── */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="flex items-center text-sm font-semibold text-gray-900">
              <SectionNumber n="03" />
              Issues Found
            </h2>
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">{issues.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {issues.map((issue, idx) => {
              const isExpanded = expandedIssue === idx;
              const compCategory = getComplianceCategory(issue.category);
              const borderColor = compCategory === "legal" ? "border-l-red-500" : compCategory === "regulatory" ? "border-l-amber-500" : "border-l-blue-500";

              return (
                <div key={idx} className={`border-l-4 ${borderColor}`}>
                  <button
                    onClick={() => setExpandedIssue(isExpanded ? null : idx)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex-shrink-0 h-2.5 w-2.5 rounded-full ${COMPLIANCE_COLORS[compCategory].dot}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{(issue as RegulatoryIssueResult & { title?: string }).title || issue.explanation?.slice(0, 60) || "Issue"}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <CategoryBadge category={issue.category} />
                          <RiskBadge level={issue.riskLevel} />
                        </div>
                      </div>
                    </div>
                    <svg className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 space-y-4">
                      {issue.sentence && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Flagged Text</p>
                          <p className="text-sm text-gray-800 bg-white rounded-lg border border-gray-200 px-3 py-2 italic">
                            &ldquo;{issue.sentence}&rdquo;
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Explanation</p>
                        <p className="text-sm text-gray-700">{issue.explanation}</p>
                      </div>

                      {issue.regulation && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Regulatory Reference</p>
                          <p className="text-sm font-medium text-slate-700">{issue.regulation}</p>
                        </div>
                      )}

                      {issue.suggestion && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Suggested Alternative</p>
                          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 12l2 2 4-4" />
                              <circle cx="12" cy="12" r="10" />
                            </svg>
                            <p className="text-sm text-green-800">{issue.suggestion}</p>
                          </div>
                        </div>
                      )}

                      {issue.countries && issue.countries.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Affected Markets</p>
                          <div className="flex gap-1.5">
                            {issue.countries.map((c) => (
                              <span key={c} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 04 PASSED CHECKS ─────────────────────────────────── */}
      {passedChecks.length > 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50/30 shadow-sm overflow-hidden">
          <div className="border-b border-green-100 px-6 py-4">
            <h2 className="flex items-center text-sm font-semibold text-gray-900">
              <SectionNumber n="04" />
              Passed Checks
            </h2>
          </div>
          <div className="p-6">
          <ul className="space-y-2">
            {passedChecks.map((check, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm text-green-800">
                <svg className="h-4 w-4 flex-shrink-0 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                {check}
              </li>
            ))}
          </ul>
          </div>
        </div>
      )}

      {/* ── 05 AUDIT TRAIL ──────────────────────────────────── */}
      {review?.reviewedAt && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="flex items-center text-sm font-semibold text-gray-900">
              <SectionNumber n="05" />
              Audit Trail
            </h2>
          </div>
          <div className="p-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-gray-500">{new Date(review.reviewedAt).toLocaleString()}</span>
              <span className="text-gray-700">Compliance review completed</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{review.framework}</span>
            </div>
            {currentStatus === "approved" && (
              <div className="flex items-center gap-3 text-sm">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-gray-500">Manual approval</span>
                <span className="text-gray-700">Marked as compliance approved</span>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
