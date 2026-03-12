"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type {
  Company,
  Week,
  TopicBankEntry,
  ContentType,
} from "@/types/database";

/** API response shape from /api/generate/status/[jobId] (camelCase) */
interface JobStatusResponse {
  id: string;
  jobType: string;
  provider: string | null;
  status: string;
  progress: number;
  errorMessage: string | null;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  contentPieceId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** API response shape from /api/generate/jobs (includes joined company/week) */
interface RecentJobRow {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  company?: { name: string };
  week?: { week_number: number; year: number };
}

const CONTENT_TYPES: { value: ContentType; label: string; description: string }[] = [
  {
    value: "social_post",
    label: "Social Post",
    description: "LinkedIn-optimised social media post with hook and CTA",
  },
  {
    value: "blog_article",
    label: "Blog Article",
    description: "800-1200 word article with SEO assets",
  },
  {
    value: "linkedin_article",
    label: "LinkedIn Article",
    description: "600-1000 word thought leadership article",
  },
  {
    value: "pdf_guide",
    label: "PDF Guide",
    description: "8-page branded guide with actionable content",
  },
  {
    value: "video_script",
    label: "Video Script",
    description: "3-5 minute video script with B-roll notes",
  },
];

type GenerateStep = "company" | "week" | "topic" | "type" | "review" | "generating" | "done";

export default function GeneratePage() {
  // Step state
  const [step, setStep] = useState<GenerateStep>("company");

  // Selection state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [topics, setTopics] = useState<TopicBankEntry[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TopicBankEntry | null>(null);
  const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);
  const [additionalContext, setAdditionalContext] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recent jobs
  const [recentJobs, setRecentJobs] = useState<RecentJobRow[]>([]);

  // Loading states
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);

  // Fetch companies on mount
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((json) => setCompanies(json.data || []))
      .finally(() => setLoadingCompanies(false));

    fetch("/api/generate/jobs?limit=10")
      .then((r) => r.json())
      .then((json) => setRecentJobs(json.data || []));
  }, []);

  // Fetch weeks when company selected
  useEffect(() => {
    if (!selectedCompany) return;
    setLoadingWeeks(true);
    fetch(`/api/weeks?companyId=${selectedCompany.id}`)
      .then((r) => r.json())
      .then((json) => setWeeks(json.data || []))
      .finally(() => setLoadingWeeks(false));
  }, [selectedCompany]);

  // Fetch topics when company selected
  useEffect(() => {
    if (!selectedCompany) return;
    setLoadingTopics(true);
    fetch(`/api/config/topic-bank?companyId=${selectedCompany.id}`)
      .then((r) => r.json())
      .then((json) => setTopics(json.data || []))
      .finally(() => setLoadingTopics(false));
  }, [selectedCompany]);

  // Poll job status
  const pollJobStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/generate/status/${id}`);
      const data = await res.json();
      setJobStatus(data);

      if (data.status === "completed") {
        setStep("done");
        setGenerating(false);
      } else if (data.status === "failed") {
        setError(data.errorMessage || "Generation failed");
        setGenerating(false);
      } else {
        // Keep polling
        setTimeout(() => pollJobStatus(id), 2000);
      }
    } catch {
      setError("Failed to check job status");
      setGenerating(false);
    }
  }, []);

  // Start generation
  async function handleGenerate() {
    if (!selectedCompany || !selectedWeek || !selectedTopic || !selectedContentType)
      return;

    setGenerating(true);
    setError(null);
    setStep("generating");

    try {
      const res = await fetch("/api/generate/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          weekId: selectedWeek.id,
          topicId: selectedTopic.id,
          contentType: selectedContentType,
          additionalContext: additionalContext || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation request failed");
      }

      setJobId(data.jobId);

      if (data.status === "completed") {
        setJobStatus(data);
        setStep("done");
        setGenerating(false);
      } else {
        // Start polling
        pollJobStatus(data.jobId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setGenerating(false);
      setStep("review");
    }
  }

  function resetForm() {
    setStep("company");
    setSelectedCompany(null);
    setSelectedWeek(null);
    setSelectedTopic(null);
    setSelectedContentType(null);
    setAdditionalContext("");
    setGenerating(false);
    setJobId(null);
    setJobStatus(null);
    setError(null);
  }

  const unusedTopics = topics.filter((t) => !t.is_used);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Generate Content</h1>
        {step !== "company" && step !== "generating" && (
          <button
            onClick={resetForm}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-xs">
        {(["company", "week", "topic", "type", "review"] as const).map(
          (s, i) => {
            const labels = ["Company", "Week", "Topic", "Type", "Review"];
            const stepOrder = ["company", "week", "topic", "type", "review"];
            const currentIndex = stepOrder.indexOf(step);
            const isActive = step === s;
            const isDone = currentIndex > i || step === "generating" || step === "done";

            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`h-px w-6 ${isDone ? "bg-sky-400" : "bg-gray-200"}`}
                  />
                )}
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isActive
                      ? "bg-sky-500 text-white"
                      : isDone
                        ? "bg-sky-100 text-sky-700"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isDone && !isActive ? "✓" : i + 1}
                </span>
                <span
                  className={`hidden sm:inline ${
                    isActive
                      ? "font-medium text-gray-900"
                      : isDone
                        ? "text-sky-600"
                        : "text-gray-400"
                  }`}
                >
                  {labels[i]}
                </span>
              </div>
            );
          }
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Generation Error</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Step 1: Select Company */}
      {step === "company" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Select Company
          </h2>
          {loadingCompanies ? (
            <p className="text-sm text-gray-400">Loading companies...</p>
          ) : companies.length === 0 ? (
            <p className="text-sm text-gray-400">
              No companies found. Create one first.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    setSelectedCompany(company);
                    setStep("week");
                  }}
                  className="rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                >
                  <p className="font-medium text-gray-900">{company.name}</p>
                  {company.spokesperson_name && (
                    <p className="mt-1 text-xs text-gray-500">
                      {company.spokesperson_name}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Week */}
      {step === "week" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Select Week for {selectedCompany?.name}
            </h2>
            <button
              onClick={() => setStep("company")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Back
            </button>
          </div>
          {loadingWeeks ? (
            <p className="text-sm text-gray-400">Loading weeks...</p>
          ) : weeks.length === 0 ? (
            <p className="text-sm text-gray-400">
              No weeks found. Create a week first in the upload section.
            </p>
          ) : (
            <div className="space-y-2">
              {weeks.map((week) => (
                <button
                  key={week.id}
                  onClick={() => {
                    setSelectedWeek(week);
                    setStep("topic");
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      Week {week.week_number}
                      {week.title ? ` — ${week.title}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {week.date_start} to {week.date_end}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      week.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : week.status === "draft"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {week.status.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select Topic */}
      {step === "topic" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Select Topic ({unusedTopics.length} available)
            </h2>
            <button
              onClick={() => setStep("week")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Back
            </button>
          </div>
          {loadingTopics ? (
            <p className="text-sm text-gray-400">Loading topics...</p>
          ) : unusedTopics.length === 0 ? (
            <div className="text-center">
              <p className="text-sm text-gray-400">
                No unused topics available.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Add topics in{" "}
                <Link
                  href={`/admin/companies/${selectedCompany?.id}/topic-bank`}
                  className="text-sky-600 hover:text-sky-800"
                >
                  Topic Bank
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {unusedTopics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => {
                    setSelectedTopic(topic);
                    setStep("type");
                  }}
                  className="flex w-full items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-500">
                    {topic.topic_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{topic.title}</p>
                    {topic.description && (
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                        {topic.description}
                      </p>
                    )}
                    <div className="mt-1 flex gap-2">
                      {topic.pillar && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                          {topic.pillar}
                        </span>
                      )}
                      {topic.audience_theme && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                          {topic.audience_theme}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Select Content Type */}
      {step === "type" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Select Content Type
            </h2>
            <button
              onClick={() => setStep("topic")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Back
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => {
                  setSelectedContentType(ct.value);
                  setStep("review");
                }}
                className="rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
              >
                <p className="font-medium text-gray-900">{ct.label}</p>
                <p className="mt-1 text-xs text-gray-500">{ct.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Review & Generate */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">
              Review Generation Request
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Company
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedCompany?.name}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Week
                </span>
                <span className="text-sm font-medium text-gray-900">
                  Week {selectedWeek?.week_number}
                  {selectedWeek?.title ? ` — ${selectedWeek.title}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Topic
                </span>
                <span className="text-sm font-medium text-gray-900">
                  #{selectedTopic?.topic_number}: {selectedTopic?.title}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">
                  Content Type
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {CONTENT_TYPES.find((ct) => ct.value === selectedContentType)?.label}
                </span>
              </div>
            </div>

            {/* Additional context */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Additional Context (optional)
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Add any specific instructions, angles, or references for this piece..."
                rows={3}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("type")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Change Type
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
            >
              Generate Content
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Generating */}
      {step === "generating" && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          <h2 className="text-lg font-semibold text-gray-900">
            Generating Content...
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {jobStatus?.provider
              ? `Using ${jobStatus.provider}`
              : "Initialising provider..."}
          </p>

          {/* Progress bar */}
          <div className="mx-auto mt-4 max-w-xs">
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-sky-500 transition-all duration-500"
                style={{ width: `${jobStatus?.progress || 5}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {jobStatus?.progress || 0}% complete
            </p>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            This typically takes 15-30 seconds. Do not close this page.
          </p>
        </div>
      )}

      {/* Step 7: Done */}
      {step === "done" && jobStatus && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Content Generated Successfully
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {(jobStatus.outputPayload?.title as string) || "Content piece created"}
          </p>
          {typeof jobStatus.outputPayload?.wordCount === "number" && (
            <p className="text-xs text-gray-500">
              {jobStatus.outputPayload.wordCount} words
              {typeof jobStatus.outputPayload?.assetCount === "number"
                ? ` · ${jobStatus.outputPayload.assetCount} assets`
                : ""}
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            {(() => {
              const pieceId = jobStatus.contentPieceId || String(jobStatus.outputPayload?.contentPieceId || "");
              return pieceId ? (
                <Link
                  href={`/content/${pieceId}`}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                >
                  View Content
                </Link>
              ) : null;
            })()}
            <button
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Generate Another
            </button>
          </div>
        </div>
      )}

      {/* Recent Jobs */}
      {recentJobs.length > 0 && step === "company" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">
            Recent Generation Jobs
          </h3>
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-md border border-gray-100 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">
                    {job.company?.name || "Unknown"} — Week{" "}
                    {job.week?.week_number || "?"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {job.job_type.replace(/_/g, " ")} · {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    job.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : job.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : job.status === "running"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
