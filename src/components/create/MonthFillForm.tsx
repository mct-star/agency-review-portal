"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";

interface MonthFillFormProps {
  companies: { id: string; name: string }[];
  showCompanyPicker: boolean;
}

interface SlotPreview {
  day: string;
  postType: string;
  topic: string;
}

type FillResult = {
  weeks: number;
  pieces: number;
  month: string;
  aiGenerated: boolean;
};

type GenerationPhase =
  | "idle"
  | "confirming"
  | "generating_titles"
  | "creating_weeks"
  | "done";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MonthFillForm({ companies, showCompanyPicker }: MonthFillFormProps) {
  const now = new Date();
  // Default to next month
  const defaultMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const defaultYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [slots, setSlots] = useState<{ day_of_week: number; post_type_label: string; scheduled_time: string }[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [result, setResult] = useState<FillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate calendar grid for the selected month
  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const weeks: { weekStart: Date; days: { date: Date; inMonth: boolean }[] }[] = [];

    // Find the Monday of the first week
    const start = new Date(firstDay);
    while (start.getDay() !== 1) {
      start.setDate(start.getDate() - 1);
    }

    let current = new Date(start);
    while (current <= lastDay || current.getDay() !== 1) {
      if (current.getDay() === 1) {
        const week: { date: Date; inMonth: boolean }[] = [];
        const weekStart = new Date(current);
        for (let i = 0; i < 7; i++) {
          week.push({
            date: new Date(current),
            inMonth: current.getMonth() === month,
          });
          current.setDate(current.getDate() + 1);
        }
        weeks.push({ weekStart, days: week });
      } else {
        current.setDate(current.getDate() + 1);
      }
      if (weeks.length >= 6) break;
    }

    return weeks;
  }, [year, month]);

  // Count weeks that have at least one day in the month
  const weeksInMonth = useMemo(
    () => calendarWeeks.filter((w) => w.days.some((d) => d.inMonth)).length,
    [calendarWeeks]
  );

  const totalSlots = weeksInMonth * slots.length;

  // Get slots for a specific day of week
  const getSlotsForDay = useCallback(
    (dayOfWeek: number): SlotPreview[] => {
      if (!previewLoaded) return [];
      return slots
        .filter((s) => s.day_of_week === dayOfWeek)
        .map((s, i) => ({
          day: FULL_DAY_NAMES[s.day_of_week],
          postType: s.post_type_label,
          topic: topics.length > 0
            ? topics[(dayOfWeek * 10 + i) % topics.length]
            : pillars.length > 0
            ? pillars[(dayOfWeek + i) % pillars.length]
            : "Topic TBD",
        }));
    },
    [previewLoaded, slots, topics, pillars]
  );

  // Load preview data (slots, pillars, topics)
  async function loadPreview() {
    setLoadingPreview(true);
    setError(null);
    try {
      const [slotsRes, stratRes, topicsRes] = await Promise.all([
        fetch(`/api/config/posting-schedule?companyId=${companyId}`),
        fetch(`/api/strategy/interview?companyId=${companyId}`),
        fetch(`/api/content/strategy-topics?companyId=${companyId}`),
      ]);

      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        const activeSlots = (slotsData.slots || [])
          .filter((s: Record<string, unknown>) => s.is_active !== false)
          .map((s: Record<string, unknown>) => ({
            day_of_week: s.day_of_week as number,
            post_type_label: ((s as Record<string, Record<string, unknown>>).post_types?.label as string) || (s.slot_label as string) || "Post",
            scheduled_time: (s.scheduled_time as string) || "",
          }));
        setSlots(activeSlots);
      }

      if (stratRes.ok) {
        const stratData = await stratRes.json();
        const responses = stratData.session?.responses || {};
        const rawPillars = (responses.pillars as Array<{ name: string }>) || [];
        setPillars(rawPillars.map((p) => p.name));
      }

      if (topicsRes.ok) {
        const topicsData = await topicsRes.json();
        setTopics((topicsData.topics || []).map((t: { title: string }) => t.title));
      }

      setPreviewLoaded(true);
    } catch (err) {
      setError("Failed to load preview data");
      console.error(err);
    } finally {
      setLoadingPreview(false);
    }
  }

  // Show confirmation dialog
  function handleFillClick() {
    setPhase("confirming");
  }

  function handleCancelConfirm() {
    setPhase("idle");
  }

  // Generate the month
  async function handleConfirmGenerate() {
    setPhase("generating_titles");
    setError(null);
    setResult(null);

    try {
      // Brief pause to show the "generating titles" state visually
      await new Promise((r) => setTimeout(r, 500));
      setPhase("creating_weeks");

      const res = await fetch("/api/generate/month-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, year, month }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate month");
        setPhase("idle");
        return;
      }

      setResult({
        weeks: data.weeks,
        pieces: data.pieces,
        month: data.month || `${MONTH_NAMES[month]} ${year}`,
        aiGenerated: data.aiGenerated || false,
      });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setPhase("idle");
    }
  }

  const selectedCompanyName = companies.find((c) => c.id === companyId)?.name || "your company";

  // ── Success state ─────────────────────────────────────────
  if (phase === "done" && result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Month planned!</h2>
        <p className="mt-2 text-sm text-gray-600">
          Created {result.weeks} weeks with {result.pieces} content slots for {result.month}.
        </p>
        {result.aiGenerated && (
          <p className="mt-1 text-xs text-emerald-600 font-medium">
            Titles generated by AI based on your strategy pillars
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            View in Calendar &rarr;
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setPhase("idle");
              setPreviewLoaded(false);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Plan Another Month
          </button>
        </div>
      </div>
    );
  }

  // ── Generating state (progress overlay) ───────────────────
  const isGenerating = phase === "generating_titles" || phase === "creating_weeks";

  return (
    <div className="space-y-6">
      {/* Confirmation Dialog */}
      {phase === "confirming" && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                Fill {MONTH_NAMES[month]} {year}?
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                This will create <span className="font-semibold">{weeksInMonth} weeks</span> with{" "}
                <span className="font-semibold">{totalSlots} content slots</span> for{" "}
                {selectedCompanyName}. AI will generate compelling titles based on your strategy pillars.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleConfirmGenerate}
                  className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                >
                  Yes, fill this month
                </button>
                <button
                  onClick={handleCancelConfirm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress overlay */}
      {isGenerating && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-6">
          <div className="flex items-center gap-4">
            <svg className="h-6 w-6 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-violet-900">
                {phase === "generating_titles"
                  ? "Generating AI titles from your strategy..."
                  : `Creating ${weeksInMonth} weeks with ${totalSlots} content slots...`}
              </p>
              <div className="mt-2 flex gap-3">
                <StepIndicator
                  label="Generate titles"
                  status={phase === "generating_titles" ? "active" : "complete"}
                />
                <StepIndicator
                  label="Create calendar"
                  status={phase === "creating_weeks" ? "active" : "pending"}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-end gap-4">
          {showCompanyPicker && (
            <div>
              <label htmlFor="company-select" className="block text-xs font-medium text-gray-500 mb-1">Company</label>
              <select
                id="company-select"
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setPreviewLoaded(false);
                  setPhase("idle");
                }}
                disabled={isGenerating}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="month-select" className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select
              id="month-select"
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                setPreviewLoaded(false);
                setPhase("idle");
              }}
              disabled={isGenerating}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="year-select" className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select
              id="year-select"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setPreviewLoaded(false);
                setPhase("idle");
              }}
              disabled={isGenerating}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              {[now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {!previewLoaded ? (
            <button
              onClick={loadPreview}
              disabled={loadingPreview || !companyId || isGenerating}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
            >
              {loadingPreview ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                "Preview Month"
              )}
            </button>
          ) : (
            <button
              onClick={handleFillClick}
              disabled={isGenerating || slots.length === 0 || phase === "confirming"}
              className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 shadow-sm"
            >
              Fill This Month
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {previewLoaded && slots.length === 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
            No posting slots configured. <Link href="/settings" className="underline font-medium">Set up your weekly rhythm</Link> first.
          </div>
        )}
      </div>

      {/* Summary stats */}
      {previewLoaded && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Weeks" value={weeksInMonth} />
          <StatCard label="Slots per week" value={slots.length} />
          <StatCard label="Total posts" value={totalSlots} />
        </div>
      )}

      {/* Calendar Preview */}
      {previewLoaded && slots.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <h2 className="text-sm font-semibold text-gray-700">
              {MONTH_NAMES[month]} {year} Preview
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {slots.length} posting slots per week across {weeksInMonth} weeks
              {pillars.length > 0 && ` | Pillars: ${pillars.join(", ")}`}
            </p>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAY_NAMES.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-medium text-gray-500 bg-gray-50">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {calendarWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
              {week.days.map((day, di) => {
                const daySlots = getSlotsForDay(day.date.getDay());
                return (
                  <div
                    key={di}
                    className={`min-h-[100px] border-r border-gray-100 last:border-r-0 p-1.5 ${
                      day.inMonth ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 ${day.inMonth ? "text-gray-900" : "text-gray-300"}`}>
                      {day.date.getDate()}
                    </div>
                    {day.inMonth && daySlots.map((slot, si) => (
                      <div
                        key={si}
                        className="mb-1 rounded bg-amber-50 border border-amber-100 px-1.5 py-1"
                      >
                        <div className="text-[10px] font-medium text-amber-700 truncate">
                          {slot.postType}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {slot.topic}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function StepIndicator({ label, status }: { label: string; status: "pending" | "active" | "complete" }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {status === "complete" && (
        <svg className="h-3.5 w-3.5 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === "active" && (
        <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
      )}
      {status === "pending" && (
        <span className="h-2 w-2 rounded-full bg-gray-300" />
      )}
      <span className={status === "active" ? "font-medium text-violet-700" : status === "complete" ? "text-violet-600" : "text-gray-400"}>
        {label}
      </span>
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
