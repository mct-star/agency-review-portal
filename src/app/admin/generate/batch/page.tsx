"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import type {
  Company,
  Week,
  TopicBankEntry,
  PostingSlotWithType,
  DistributionPlatform,
} from "@/types/database";
import {
  getPlatformsForContentType,
  getPlatformCapability,
  getDefaultAdaptationType,
} from "@/lib/platform-registry";

// ── Types ───────────────────────────────────────────────────

interface SlotAssignment {
  slotId: string;
  topic: TopicBankEntry | null;
  additionalContext: string;
}

interface PieceResult {
  slotId: string;
  status: "pending" | "generating" | "adapting" | "completed" | "failed";
  contentPieceId: string | null;
  title: string | null;
  error: string | null;
  progress: number;
}

type BatchStep = "company" | "week" | "assign" | "platforms" | "review" | "generating" | "done";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ARCHETYPE_COLORS: Record<string, string> = {
  A1_green: "border-l-green-500",
  A1_purple: "border-l-purple-500",
  A1_blue: "border-l-blue-500",
  A2_editorial: "border-l-orange-500",
  A3B_real_photo: "border-l-amber-500",
  A4_pixar: "border-l-pink-500",
  A5_carousel: "border-l-cyan-500",
  A7_infographic: "border-l-indigo-500",
};

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m}${suffix}`;
}

// ── Main Component ──────────────────────────────────────────

export default function BatchGeneratePage() {
  const [step, setStep] = useState<BatchStep>("company");

  // Selection state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [topics, setTopics] = useState<TopicBankEntry[]>([]);
  const [slots, setSlots] = useState<PostingSlotWithType[]>([]);
  const [spokespersonName, setSpokespersonName] = useState("");

  // Slot assignments
  const [assignments, setAssignments] = useState<SlotAssignment[]>([]);
  const [results, setResults] = useState<PieceResult[]>([]);

  // Platform adaptation
  const [adaptPlatforms, setAdaptPlatforms] = useState<DistributionPlatform[]>([]);

  // Loading
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Topic search filter
  const [topicSearch, setTopicSearch] = useState("");

  // Fetch companies
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((json) => setCompanies(json.data || []))
      .finally(() => setLoadingCompanies(false));
  }, []);

  // Fetch weeks + topics + slots when company selected
  useEffect(() => {
    if (!selectedCompany) return;
    setSpokespersonName(selectedCompany.spokesperson_name || "");
    setLoadingWeeks(true);
    setLoadingSlots(true);

    Promise.all([
      fetch(`/api/weeks?companyId=${selectedCompany.id}`).then((r) => r.json()),
      fetch(`/api/config/topic-bank?companyId=${selectedCompany.id}`).then((r) => r.json()),
      fetch(`/api/config/posting-schedule?companyId=${selectedCompany.id}`).then((r) => r.json()),
    ]).then(([weeksJson, topicsJson, schedJson]) => {
      setWeeks(weeksJson.data || []);
      setTopics(topicsJson.data || []);
      setSlots(schedJson.data?.slots || []);
      setLoadingWeeks(false);
      setLoadingSlots(false);
    });
  }, [selectedCompany]);

  // Initialize assignments when slots load
  useEffect(() => {
    if (slots.length > 0 && assignments.length === 0) {
      setAssignments(
        slots
          .filter((s) => s.is_active)
          .map((s) => ({
            slotId: s.id,
            topic: null,
            additionalContext: "",
          }))
      );
    }
  }, [slots, assignments.length]);

  const unusedTopics = topics.filter((t) => !t.is_used);
  const assignedTopicIds = new Set(
    assignments.filter((a) => a.topic).map((a) => a.topic!.id)
  );

  const filteredTopics = unusedTopics.filter((t) => {
    if (assignedTopicIds.has(t.id)) return false;
    if (!topicSearch) return true;
    const q = topicSearch.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.pillar && t.pillar.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  });

  // Auto-assign topics based on pillar matching
  function autoAssign() {
    if (!selectedWeek) return;
    const updated = [...assignments];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].topic) continue; // Already assigned

      const slot = slots.find((s) => s.id === updated[i].slotId);
      if (!slot) continue;

      // Find a matching unused topic
      const usedIds = new Set(updated.filter((a) => a.topic).map((a) => a.topic!.id));

      // Prefer topics matching the week pillar, then any unused
      const pillarTopics = unusedTopics.filter(
        (t) =>
          !usedIds.has(t.id) &&
          t.pillar &&
          selectedWeek.pillar &&
          t.pillar === selectedWeek.pillar
      );
      const otherTopics = unusedTopics.filter(
        (t) => !usedIds.has(t.id) && !pillarTopics.includes(t)
      );

      const available = [...pillarTopics, ...otherTopics];
      if (available.length > 0) {
        updated[i] = { ...updated[i], topic: available[0] };
      }
    }

    setAssignments(updated);
  }

  function assignTopic(slotId: string, topic: TopicBankEntry) {
    setAssignments((prev) =>
      prev.map((a) => (a.slotId === slotId ? { ...a, topic } : a))
    );
  }

  function unassignTopic(slotId: string) {
    setAssignments((prev) =>
      prev.map((a) => (a.slotId === slotId ? { ...a, topic: null } : a))
    );
  }

  function updateContext(slotId: string, context: string) {
    setAssignments((prev) =>
      prev.map((a) => (a.slotId === slotId ? { ...a, additionalContext: context } : a))
    );
  }

  function togglePlatform(platform: DistributionPlatform) {
    setAdaptPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  function getRelevantPlatforms() {
    const contentTypes = [...new Set(slots.map((s) => s.post_types?.content_type).filter(Boolean))];
    const seen = new Set<DistributionPlatform>();
    const result: ReturnType<typeof getPlatformsForContentType> = [];
    for (const ct of contentTypes) {
      for (const cap of getPlatformsForContentType(ct!)) {
        if (!seen.has(cap.platform)) {
          seen.add(cap.platform);
          result.push(cap);
        }
      }
    }
    return result;
  }

  // Generate all assigned pieces sequentially
  const handleBatchGenerate = useCallback(async () => {
    if (!selectedCompany || !selectedWeek) return;
    const activeAssignments = assignments.filter((a) => a.topic);
    if (activeAssignments.length === 0) return;

    setGenerating(true);
    setError(null);
    setStep("generating");

    const initialResults: PieceResult[] = activeAssignments.map((a) => ({
      slotId: a.slotId,
      status: "pending",
      contentPieceId: null,
      title: null,
      error: null,
      progress: 0,
    }));
    setResults(initialResults);
    const updatedResults = [...initialResults];

    for (let i = 0; i < activeAssignments.length; i++) {
      const assignment = activeAssignments[i];
      const slot = slots.find((s) => s.id === assignment.slotId);
      if (!slot || !assignment.topic) continue;

      const pt = slot.post_types;

      // Mark as generating
      updatedResults[i] = { ...updatedResults[i], status: "generating", progress: 10 };
      setResults([...updatedResults]);

      try {
        // Generate content with full slot context
        const res = await fetch("/api/generate/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            weekId: selectedWeek.id,
            topicId: assignment.topic.id,
            contentType: pt?.content_type || "social_post",
            additionalContext: assignment.additionalContext || undefined,
            spokespersonName: spokespersonName || undefined,
            // Slot-specific fields
            postingSlotId: slot.id,
            postTypeSlug: pt?.slug,
            postTypeLabel: pt?.label,
            templateInstructions: pt?.template_instructions,
            wordCountMin: pt?.word_count_min,
            wordCountMax: pt?.word_count_max,
            imageArchetype: slot.image_archetype || pt?.default_image_archetype,
            ctaUrl: slot.cta_url,
            ctaLinkText: slot.cta_link_text,
            dayOfWeek: slot.day_of_week,
            scheduledTime: slot.scheduled_time,
            slotLabel: slot.slot_label,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Generation failed");
        }

        const contentPieceId = data.contentPieceId;

        // Platform adaptation
        if (adaptPlatforms.length > 0 && contentPieceId) {
          updatedResults[i] = {
            ...updatedResults[i],
            status: "adapting",
            progress: 70,
            contentPieceId,
            title: assignment.topic.title,
          };
          setResults([...updatedResults]);

          const platformsPayload = adaptPlatforms
            .filter((p) => {
              const cap = getPlatformCapability(p);
              return cap && cap.supportedContentTypes.includes(pt?.content_type || "social_post");
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
                body: JSON.stringify({ contentPieceId, platforms: platformsPayload }),
              });
            } catch {
              // Non-fatal
            }
          }
        }

        updatedResults[i] = {
          ...updatedResults[i],
          status: "completed",
          progress: 100,
          contentPieceId,
          title: assignment.topic.title,
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
  }, [selectedCompany, selectedWeek, assignments, slots, spokespersonName, adaptPlatforms]);

  function resetForm() {
    setStep("company");
    setSelectedCompany(null);
    setSelectedWeek(null);
    setAssignments([]);
    setResults([]);
    setAdaptPlatforms([]);
    setSpokespersonName("");
    setGenerating(false);
    setError(null);
    setTopicSearch("");
  }

  const assignedCount = assignments.filter((a) => a.topic).length;
  const totalSlots = assignments.length;
  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  // Group assignments by day for display
  const slotsByDay: Record<number, { assignment: SlotAssignment; slot: PostingSlotWithType }[]> = {};
  for (let d = 0; d < 7; d++) slotsByDay[d] = [];
  for (const assignment of assignments) {
    const slot = slots.find((s) => s.id === assignment.slotId);
    if (slot) {
      slotsByDay[slot.day_of_week]?.push({ assignment, slot });
    }
  }
  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) =>
      a.slot.scheduled_time.localeCompare(b.slot.scheduled_time)
    );
  }

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
        {(["company", "week", "assign", "platforms", "review"] as const).map((s, i) => {
          const labels = ["Company", "Week", "Assign Topics", "Platforms", "Review"];
          const stepOrder: BatchStep[] = ["company", "week", "assign", "platforms", "review"];
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
          {loadingWeeks || loadingSlots ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : weeks.length === 0 ? (
            <p className="text-sm text-gray-400">No weeks found. Create one first.</p>
          ) : (
            <>
              {slots.length === 0 && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-700">
                    No posting schedule configured for this company.{" "}
                    <Link
                      href={`/admin/companies/${selectedCompany?.id}/posting-schedule`}
                      className="font-medium underline"
                    >
                      Set up posting schedule
                    </Link>{" "}
                    first for slot-based generation.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {weeks.map((week) => (
                  <button
                    key={week.id}
                    onClick={() => {
                      setSelectedWeek(week);
                      setStep("assign");
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {formatWeekLabel(week.date_start, week.week_number)}
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
            </>
          )}
        </div>
      )}

      {/* Step 3: Assign Topics to Slots */}
      {step === "assign" && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Assign Topics to Slots ({assignedCount}/{totalSlots})
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatWeekLabel(selectedWeek?.date_start, selectedWeek?.week_number ?? 0)} for {selectedCompany?.name}
                  {selectedWeek?.pillar ? ` \u00b7 Pillar: ${selectedWeek.pillar}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={autoAssign}
                  disabled={unusedTopics.length === 0}
                  className="rounded-md bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                >
                  Auto-Assign
                </button>
                <button onClick={() => setStep("week")} className="text-xs text-gray-400 hover:text-gray-600">
                  &larr; Back
                </button>
              </div>
            </div>

            {/* Spokesperson */}
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-500">Spokesperson</label>
              <input
                type="text"
                value={spokespersonName}
                onChange={(e) => setSpokespersonName(e.target.value)}
                className="w-full max-w-sm rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-300"
              />
            </div>
          </div>

          {/* Weekly schedule with topic assignment */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Left: Slot cards by day */}
            <div className="space-y-3">
              {DAY_NAMES.map((dayName, dayIndex) => {
                const dayEntries = slotsByDay[dayIndex] || [];
                if (dayEntries.length === 0) return null;

                return (
                  <div key={dayIndex} className="rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-2">
                      <span className="text-xs font-semibold text-gray-900">{dayName}</span>
                    </div>
                    <div className="space-y-2 p-3">
                      {dayEntries.map(({ assignment, slot }) => {
                        const pt = slot.post_types;
                        const borderColor = slot.image_archetype
                          ? ARCHETYPE_COLORS[slot.image_archetype] || "border-l-gray-300"
                          : "border-l-gray-200";

                        return (
                          <div
                            key={slot.id}
                            className={`rounded-md border border-gray-100 border-l-4 ${borderColor} bg-gray-50/50 p-3`}
                          >
                            {/* Slot header */}
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-medium text-gray-900">
                                  {pt?.label || "Unknown"}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  {formatTime(slot.scheduled_time)}
                                  {pt?.word_count_min && pt?.word_count_max
                                    ? ` \u00b7 ${pt.word_count_min}-${pt.word_count_max}w`
                                    : ""}
                                  {slot.image_archetype
                                    ? ` \u00b7 ${slot.image_archetype.replace(/_/g, " ")}`
                                    : ""}
                                </p>
                              </div>
                              {assignment.topic && (
                                <button
                                  onClick={() => unassignTopic(slot.id)}
                                  className="text-[10px] text-red-400 hover:text-red-600"
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            {/* Assigned topic or picker */}
                            {assignment.topic ? (
                              <div className="mt-2 rounded bg-purple-50 px-2 py-1.5">
                                <p className="text-xs font-medium text-purple-900">
                                  #{assignment.topic.topic_number}: {assignment.topic.title}
                                </p>
                                {assignment.topic.pillar && (
                                  <p className="text-[10px] text-purple-600">
                                    {assignment.topic.pillar}
                                  </p>
                                )}
                                <input
                                  type="text"
                                  value={assignment.additionalContext}
                                  onChange={(e) => updateContext(slot.id, e.target.value)}
                                  placeholder="Additional context..."
                                  className="mt-1 w-full rounded border border-purple-200 bg-white px-2 py-1 text-[11px] focus:border-purple-300 focus:outline-none"
                                />
                              </div>
                            ) : (
                              <p className="mt-2 text-[10px] italic text-gray-400">
                                Click a topic from the bank to assign
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Topic bank */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900">
                    Topic Bank ({filteredTopics.length} available)
                  </span>
                </div>
                <input
                  type="text"
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  placeholder="Search topics..."
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-purple-300 focus:outline-none"
                />
              </div>
              <div className="max-h-[600px] overflow-y-auto p-2">
                <div className="space-y-1">
                  {filteredTopics.slice(0, 30).map((topic) => {
                    // Find the first unassigned slot to assign to
                    const firstUnassigned = assignments.find((a) => !a.topic);

                    return (
                      <button
                        key={topic.id}
                        onClick={() => {
                          if (firstUnassigned) {
                            assignTopic(firstUnassigned.slotId, topic);
                          }
                        }}
                        disabled={!firstUnassigned}
                        className="flex w-full items-start gap-2 rounded-md border border-dashed border-gray-200 p-2 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/30 disabled:opacity-30"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-500">
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
                            {topic.audience_theme && (
                              <span className="text-[10px] text-gray-400">
                                \u00b7 {topic.audience_theme}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep("platforms")}
              disabled={assignedCount === 0}
              className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              Next: Platform Adaptation ({assignedCount} pieces)
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
                </p>
              </div>
              <button onClick={() => setStep("assign")} className="text-xs text-gray-400 hover:text-gray-600">
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
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Review Batch Generation</h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Company</span>
                <span className="text-sm font-medium text-gray-900">{selectedCompany?.name}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Week</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatWeekLabel(selectedWeek?.date_start, selectedWeek?.week_number ?? 0)}
                  {selectedWeek?.title ? ` \u2014 ${selectedWeek.title}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Spokesperson</span>
                <span className="text-sm font-medium text-gray-900">{spokespersonName || "\u2014"}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-medium uppercase text-gray-500">Pieces</span>
                <span className="text-sm font-medium text-gray-900">{assignedCount}</span>
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
              {assignments
                .filter((a) => a.topic)
                .map((assignment) => {
                  const slot = slots.find((s) => s.id === assignment.slotId);
                  const pt = slot?.post_types;
                  return (
                    <div
                      key={assignment.slotId}
                      className="flex items-center gap-2 rounded-md bg-purple-50/50 px-3 py-2"
                    >
                      <span className="flex h-5 shrink-0 items-center justify-center rounded bg-purple-100 px-1.5 text-[10px] font-bold text-purple-700">
                        {slot ? DAY_NAMES[slot.day_of_week].slice(0, 3) : "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-gray-900">
                          #{assignment.topic!.topic_number}: {assignment.topic!.title}
                        </span>
                      </div>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                        {pt?.label || pt?.content_type?.replace("_", " ") || "social post"}
                      </span>
                      {slot && (
                        <span className="text-[10px] text-gray-400">
                          {formatTime(slot.scheduled_time)}
                        </span>
                      )}
                    </div>
                  );
                })}
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
              Generate {assignedCount} Pieces
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Generating / Done */}
      {(step === "generating" || step === "done") && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {step === "generating"
                  ? "Generating Content..."
                  : `Complete \u2014 ${completedCount}/${assignedCount} succeeded`}
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
                {` of ${assignedCount} pieces`}
              </p>
            </div>

            {/* Per-piece status */}
            <div className="space-y-2">
              {results.map((result) => {
                const assignment = assignments.find((a) => a.slotId === result.slotId);
                const slot = slots.find((s) => s.id === result.slotId);
                return (
                  <div
                    key={result.slotId}
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
                        <span className="font-medium text-gray-500">
                          {slot ? `${DAY_NAMES[slot.day_of_week].slice(0, 3)} ${formatTime(slot.scheduled_time)}` : ""}
                        </span>
                        {" "}
                        #{assignment?.topic?.topic_number}: {result.title || assignment?.topic?.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {result.status === "adapting"
                          ? "Adapting to platforms..."
                          : result.status === "generating"
                            ? `Generating ${slot?.post_types?.label || "content"}...`
                            : result.status === "failed"
                              ? result.error
                              : result.status === "completed"
                                ? slot?.post_types?.label || "Content"
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
