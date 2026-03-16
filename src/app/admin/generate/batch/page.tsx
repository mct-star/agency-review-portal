"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type {
  Company,
  Week,
  TopicBankEntry,
  ContentType,
  DistributionPlatform,
} from "@/types/database";
import {
  getPlatformsForContentType,
  getPlatformCapability,
  getDefaultAdaptationType,
} from "@/lib/platform-registry";

// ── Types ───────────────────────────────────────────────────

interface PieceConfig {
  id: string; // local UI key
  topic: TopicBankEntry;
  contentType: ContentType;
  additionalContext: string;
}

interface PieceResult {
  id: string;
  status: "pending" | "generating" | "adapting" | "completed" | "failed";
  contentPieceId: string | null;
  title: string | null;
  error: string | null;
  progress: number;
}

type BatchStep = "company" | "week" | "pieces" | "platforms" | "review" | "generating" | "done";

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "social_post", label: "Social Post" },
  { value: "blog_article", label: "Blog Article" },
  { value: "linkedin_article", label: "LinkedIn Article" },
  { value: "pdf_guide", label: "PDF Guide" },
  { value: "video_script", label: "Video Script" },
];

let nextPieceId = 1;

export default function BatchGeneratePage() {
  const [step, setStep] = useState<BatchStep>("company");

  // Selection state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [topics, setTopics] = useState<TopicBankEntry[]>([]);
  const [spokespersonName, setSpokespersonName] = useState("");

  // Piece configuration
  const [pieces, setPieces] = useState<PieceConfig[]>([]);
  const [results, setResults] = useState<PieceResult[]>([]);

  // Platform adaptation
  const [adaptPlatforms, setAdaptPlatforms] = useState<DistributionPlatform[]>([]);

  // Loading
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch companies
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((json) => setCompanies(json.data || []))
      .finally(() => setLoadingCompanies(false));
  }, []);

  // Fetch weeks + topics when company selected
  useEffect(() => {
    if (!selectedCompany) return;
    setSpokespersonName(selectedCompany.spokesperson_name || "");
    setLoadingWeeks(true);
    setLoadingTopics(true);
    fetch(`/api/weeks?companyId=${selectedCompany.id}`)
      .then((r) => r.json())
      .then((json) => setWeeks(json.data || []))
      .finally(() => setLoadingWeeks(false));
    fetch(`/api/config/topic-bank?companyId=${selectedCompany.id}`)
      .then((r) => r.json())
      .then((json) => setTopics(json.data || []))
      .finally(() => setLoadingTopics(false));
  }, [selectedCompany]);

  const unusedTopics = topics.filter((t) => !t.is_used);
  const usedTopicIds = new Set(pieces.map((p) => p.topic.id));

  // Auto-suggest pieces based on week pillar
  function autoSuggestPieces() {
    if (!selectedWeek || unusedTopics.length === 0) return;

    // Pick topics matching the week's pillar, then fill with any unused
    const pillarTopics = unusedTopics.filter(
      (t) => t.pillar && t.pillar === selectedWeek.pillar && !usedTopicIds.has(t.id)
    );
    const otherTopics = unusedTopics.filter(
      (t) => !pillarTopics.includes(t) && !usedTopicIds.has(t.id)
    );
    const available = [...pillarTopics, ...otherTopics];

    // Standard week: 1 blog + 3-4 social posts + 1 PDF or video
    const suggestions: PieceConfig[] = [];
    const contentPlan: ContentType[] = [
      "blog_article",
      "social_post",
      "social_post",
      "social_post",
      "linkedin_article",
    ];

    for (const contentType of contentPlan) {
      const topic = available.find(
        (t) => !suggestions.some((s) => s.topic.id === t.id)
      );
      if (!topic) break;
      suggestions.push({
        id: `piece-${nextPieceId++}`,
        topic,
        contentType,
        additionalContext: "",
      });
    }

    setPieces((prev) => [...prev, ...suggestions]);
  }

  function addPiece(topic: TopicBankEntry) {
    setPieces((prev) => [
      ...prev,
      {
        id: `piece-${nextPieceId++}`,
        topic,
        contentType: "social_post",
        additionalContext: "",
      },
    ]);
  }

  function removePiece(id: string) {
    setPieces((prev) => prev.filter((p) => p.id !== id));
  }

  function updatePieceType(id: string, contentType: ContentType) {
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, contentType } : p))
    );
  }

  function updatePieceContext(id: string, additionalContext: string) {
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, additionalContext } : p))
    );
  }

  function togglePlatform(platform: DistributionPlatform) {
    setAdaptPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  // Get all platforms relevant to the selected content types
  function getRelevantPlatforms() {
    const contentTypes = [...new Set(pieces.map((p) => p.contentType))];
    const seen = new Set<DistributionPlatform>();
    const result: ReturnType<typeof getPlatformsForContentType> = [];
    for (const ct of contentTypes) {
      for (const cap of getPlatformsForContentType(ct)) {
        if (!seen.has(cap.platform)) {
          seen.add(cap.platform);
          result.push(cap);
        }
      }
    }
    return result;
  }

  // Generate all pieces sequentially
  const handleBatchGenerate = useCallback(async () => {
    if (!selectedCompany || !selectedWeek || pieces.length === 0) return;
    setGenerating(true);
    setError(null);
    setStep("generating");

    // Initialise results
    const initialResults: PieceResult[] = pieces.map((p) => ({
      id: p.id,
      status: "pending",
      contentPieceId: null,
      title: null,
      error: null,
      progress: 0,
    }));
    setResults(initialResults);

    const updatedResults = [...initialResults];

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];

      // Mark as generating
      updatedResults[i] = { ...updatedResults[i], status: "generating", progress: 10 };
      setResults([...updatedResults]);

      try {
        // Generate content
        const res = await fetch("/api/generate/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            weekId: selectedWeek.id,
            topicId: piece.topic.id,
            contentType: piece.contentType,
            additionalContext: piece.additionalContext || undefined,
            spokespersonName: spokespersonName || undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Generation failed");
        }

        const contentPieceId = data.contentPieceId;
        const title = data.outputPayload?.title || piece.topic.title;

        // If we have platforms to adapt to, do it now
        if (adaptPlatforms.length > 0 && contentPieceId) {
          updatedResults[i] = {
            ...updatedResults[i],
            status: "adapting",
            progress: 70,
            contentPieceId,
            title,
          };
          setResults([...updatedResults]);

          // Build platform adaptation request
          const platformsPayload = adaptPlatforms
            .filter((p) => {
              // Only adapt to platforms that support this content type
              const cap = getPlatformCapability(p);
              return cap && cap.supportedContentTypes.includes(piece.contentType);
            })
            .map((p) => ({
              platform: p,
              adaptationType: getDefaultAdaptationType(p),
            }));

          if (platformsPayload.length > 0) {
            try {
              await fetch("/api/generate/adapt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contentPieceId,
                  platforms: platformsPayload,
                }),
              });
            } catch {
              // Non-fatal — adaptation can be done later manually
            }
          }
        }

        updatedResults[i] = {
          ...updatedResults[i],
          status: "completed",
          progress: 100,
          contentPieceId,
          title,
        };
      } catch (err) {
        updatedResults[i] = {
          ...updatedResults[i],
          status: "failed",
          progress: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      setResults([...updatedResults]);
    }

    setGenerating(false);
    setStep("done");
  }, [selectedCompany, selectedWeek, pieces, spokespersonName, adaptPlatforms]);

  function resetForm() {
    setStep("company");
    setSelectedCompany(null);
    setSelectedWeek(null);
    setPieces([]);
    setResults([]);
    setAdaptPlatforms([]);
    setSpokespersonName("");
    setGenerating(false);
    setError(null);
  }

  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Generate Full Week</h1>
          <Link
            href="/admin/generate"
            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            Single Piece Mode
          </Link>
        </div>
        {step !== "company" && step !== "generating" && (
          <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">
            Start Over
          </button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-xs">
        {(["company", "week", "pieces", "platforms", "review"] as const).map((s, i) => {
          const labels = ["Company", "Week", "Pieces", "Platforms", "Review"];
          const stepOrder: BatchStep[] = ["company", "week", "pieces", "platforms", "review"];
          const currentIndex = stepOrder.indexOf(step);
          const isActive = step === s;
          const isDone = currentIndex > i || step === "generating" || step === "done";
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${isDone ? "bg-purple-400" : "bg-gray-200"}`} />}
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isActive
                    ? "bg-purple-500 text-white"
                    : isDone
                      ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {isDone && !isActive ? "\u2713" : i + 1}
              </span>
              <span
                className={`hidden sm:inline ${
                  isActive ? "font-medium text-gray-900" : isDone ? "text-purple-600" : "text-gray-400"
                }`}
              >
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step 1: Company */}
      {step === "company" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Select Company</h2>
          {loadingCompanies ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    setSelectedCompany(company);
                    setStep("week");
                  }}
                  className="rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/50"
                >
                  <p className="font-medium text-gray-900">{company.name}</p>
                  {company.spokesperson_name && (
                    <p className="mt-1 text-xs text-gray-500">{company.spokesperson_name}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Week */}
      {step === "week" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Select Week for {selectedCompany?.name}
            </h2>
            <button onClick={() => setStep("company")} className="text-xs text-gray-400 hover:text-gray-600">
              &larr; Back
            </button>
          </div>
          {loadingWeeks ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : weeks.length === 0 ? (
            <p className="text-sm text-gray-400">No weeks found. Create one first.</p>
          ) : (
            <div className="space-y-2">
              {weeks.map((week) => (
                <button
                  key={week.id}
                  onClick={() => {
                    setSelectedWeek(week);
                    setStep("pieces");
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/50"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      Week {week.week_number}
                      {week.title ? ` \u2014 ${week.title}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {week.date_start} to {week.date_end}
                      {week.pillar ? ` \u00b7 ${week.pillar}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      week.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
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

      {/* Step 3: Configure Pieces */}
      {step === "pieces" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Configure Content Pieces ({pieces.length} selected)
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={autoSuggestPieces}
                  disabled={unusedTopics.length === 0}
                  className="rounded-md bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                >
                  Auto-Suggest
                </button>
                <button onClick={() => setStep("week")} className="text-xs text-gray-400 hover:text-gray-600">
                  &larr; Back
                </button>
              </div>
            </div>

            {/* Spokesperson */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">Spokesperson</label>
              <input
                type="text"
                value={spokespersonName}
                onChange={(e) => setSpokespersonName(e.target.value)}
                className="w-full max-w-sm rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-300"
              />
            </div>

            {/* Configured pieces */}
            {pieces.length > 0 && (
              <div className="mb-4 space-y-3">
                {pieces.map((piece, i) => (
                  <div
                    key={piece.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3"
                  >
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-purple-100 text-xs font-bold text-purple-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          #{piece.topic.topic_number}: {piece.topic.title}
                        </p>
                        <button
                          onClick={() => removePiece(piece.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={piece.contentType}
                          onChange={(e) =>
                            updatePieceType(piece.id, e.target.value as ContentType)
                          }
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-purple-300 focus:outline-none"
                        >
                          {CONTENT_TYPES.map((ct) => (
                            <option key={ct.value} value={ct.value}>
                              {ct.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={piece.additionalContext}
                          onChange={(e) =>
                            updatePieceContext(piece.id, e.target.value)
                          }
                          placeholder="Additional context..."
                          className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-purple-300 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add topics */}
            {loadingTopics ? (
              <p className="text-xs text-gray-400">Loading topics...</p>
            ) : (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Add topics ({unusedTopics.filter((t) => !usedTopicIds.has(t.id)).length} available)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {unusedTopics
                    .filter((t) => !usedTopicIds.has(t.id))
                    .slice(0, 12)
                    .map((topic) => (
                      <button
                        key={topic.id}
                        onClick={() => addPiece(topic)}
                        className="flex items-start gap-2 rounded-md border border-dashed border-gray-200 p-2 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/30"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
                          {topic.topic_number}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-700 line-clamp-1">
                            {topic.title}
                          </p>
                          <div className="flex gap-1">
                            {topic.pillar && (
                              <span className="text-[10px] text-gray-400">{topic.pillar}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep("platforms")}
              disabled={pieces.length === 0}
              className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              Next: Platform Adaptation
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Platform Adaptation */}
      {step === "platforms" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Auto-Adapt to Platforms (optional)
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Select platforms to auto-generate adapted versions after content creation.
                  You can skip this and adapt manually later.
                </p>
              </div>
              <button onClick={() => setStep("pieces")} className="text-xs text-gray-400 hover:text-gray-600">
                &larr; Back
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {getRelevantPlatforms().map((cap) => {
                const isSelected = adaptPlatforms.includes(cap.platform);
                return (
                  <button
                    key={cap.platform}
                    onClick={() => togglePlatform(cap.platform)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-purple-300 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{cap.label}</span>
                      <span
                        className={`h-4 w-4 rounded-full border-2 ${
                          isSelected
                            ? "border-purple-500 bg-purple-500"
                            : "border-gray-300"
                        }`}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {cap.maxChars ? `${cap.maxChars} chars` : cap.category}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setAdaptPlatforms([]);
                setStep("review");
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Skip adaptation
            </button>
            <button
              onClick={() => setStep("review")}
              className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">
              Review Batch Generation
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Company</span>
                <span className="text-sm font-medium text-gray-900">{selectedCompany?.name}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Week</span>
                <span className="text-sm font-medium text-gray-900">
                  Week {selectedWeek?.week_number}
                  {selectedWeek?.title ? ` \u2014 ${selectedWeek.title}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Spokesperson</span>
                <span className="text-sm font-medium text-gray-900">{spokespersonName || "\u2014"}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Pieces</span>
                <span className="text-sm font-medium text-gray-900">{pieces.length}</span>
              </div>
              {adaptPlatforms.length > 0 && (
                <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                  <span className="text-xs font-medium uppercase text-gray-500">Auto-adapt</span>
                  <span className="text-sm text-gray-900">
                    {adaptPlatforms.map((p) => getPlatformCapability(p)?.shortLabel || p).join(", ")}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-gray-500">Content pieces to generate:</p>
              {pieces.map((piece, i) => (
                <div key={piece.id} className="flex items-center gap-2 rounded-md bg-purple-50/50 px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple-100 text-xs font-bold text-purple-700">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-900">
                    #{piece.topic.topic_number}: {piece.topic.title}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {CONTENT_TYPES.find((ct) => ct.value === piece.contentType)?.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep("platforms")} className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Back
            </button>
            <button
              onClick={handleBatchGenerate}
              disabled={generating}
              className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              Generate {pieces.length} Pieces
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Generating */}
      {(step === "generating" || step === "done") && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {step === "generating"
                  ? "Generating Content..."
                  : `Complete \u2014 ${completedCount}/${pieces.length} succeeded`}
              </h2>
              {step === "generating" && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              )}
            </div>

            {/* Overall progress */}
            <div className="mb-4">
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-purple-500 transition-all duration-300"
                  style={{
                    width: `${
                      results.length > 0
                        ? (results.filter((r) => r.status === "completed" || r.status === "failed").length /
                            results.length) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {completedCount} completed
                {failedCount > 0 ? `, ${failedCount} failed` : ""}
                {` of ${pieces.length} pieces`}
              </p>
            </div>

            {/* Per-piece status */}
            <div className="space-y-2">
              {results.map((result, i) => {
                const piece = pieces[i];
                return (
                  <div
                    key={result.id}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                      result.status === "completed"
                        ? "bg-green-50"
                        : result.status === "failed"
                          ? "bg-red-50"
                          : result.status === "generating" || result.status === "adapting"
                            ? "bg-purple-50"
                            : "bg-gray-50"
                    }`}
                  >
                    {/* Status icon */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {result.status === "completed" ? (
                        <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          />
                        </svg>
                      ) : result.status === "failed" ? (
                        <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          />
                        </svg>
                      ) : result.status === "generating" || result.status === "adapting" ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-gray-200" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900">
                        #{piece?.topic.topic_number}: {result.title || piece?.topic.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {result.status === "adapting"
                          ? "Adapting to platforms..."
                          : result.status === "generating"
                            ? "Generating..."
                            : result.status === "failed"
                              ? result.error
                              : result.status === "completed"
                                ? CONTENT_TYPES.find((ct) => ct.value === piece?.contentType)?.label
                                : "Waiting..."}
                      </p>
                    </div>

                    {/* Link to view */}
                    {result.contentPieceId && result.status === "completed" && (
                      <Link
                        href={`/content/${result.contentPieceId}`}
                        className="shrink-0 text-xs text-purple-600 hover:text-purple-800"
                      >
                        View
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {step === "done" && (
            <div className="flex items-center justify-center gap-3">
              {selectedWeek && (
                <Link
                  href={`/weeks/${selectedWeek.id}`}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                >
                  View Week
                </Link>
              )}
              <button
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Generate Another Week
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
