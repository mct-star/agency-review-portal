"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RUN_STATE_META,
  ACTIVE_RUN_STATES,
  WEEK_BOARD_POLL_INTERVAL_MS,
} from "@/lib/constants/week-board";
import type { WeekBoardRow } from "@/lib/weeks/board-data";

interface WeekBoardProps {
  initialWeeks: WeekBoardRow[];
  initialHiddenCount: number;
}

type RunMode = "fresh" | "resume";

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const startLabel = startDate.toLocaleDateString("en-GB", opts);
  const endLabel = endDate.toLocaleDateString("en-GB", {
    ...opts,
    year: "numeric",
  });
  return `${startLabel} to ${endLabel}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Never run";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function weekLabel(week: WeekBoardRow): string {
  return week.week_number === 0 ? "Standalone" : `Week ${week.week_number}`;
}

export default function WeekBoard({
  initialWeeks,
  initialHiddenCount,
}: WeekBoardProps) {
  const [weeks, setWeeks] = useState<WeekBoardRow[]>(initialWeeks);
  const [hiddenCount, setHiddenCount] = useState(initialHiddenCount);
  const [pendingWeekId, setPendingWeekId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);

  const weeksRef = useRef(weeks);
  weeksRef.current = weeks;
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/weeks");
      const json = await res.json();
      if (!res.ok) {
        setListError(json.error || "Failed to refresh the board");
        return;
      }
      setListError(null);
      setWeeks(json.data || []);
      setHiddenCount(json.hiddenCount ?? 0);
    } catch {
      setListError("Failed to refresh the board");
    }
  }, []);

  // Poll only while at least one week has an active job. Recursive
  // setTimeout (not setInterval) so a slow request never overlaps
  // with the next tick, and polling stops cleanly once nothing is
  // active rather than running forever in the background.
  const scheduleNextPoll = useCallback(() => {
    const hasActive = weeksRef.current.some((w) =>
      ACTIVE_RUN_STATES.includes(w.run_state)
    );
    if (!hasActive) return;
    pollTimeoutRef.current = setTimeout(async () => {
      await refresh();
      scheduleNextPoll();
    }, WEEK_BOARD_POLL_INTERVAL_MS);
  }, [refresh]);

  useEffect(() => {
    scheduleNextPoll();
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
    // Only re-arm on mount; scheduleNextPoll reads live state via weeksRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(weekId: string, mode: RunMode) {
    setPendingWeekId(weekId);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[weekId];
      return next;
    });

    try {
      const res = await fetch(`/api/admin/weeks/${weekId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();

      if (res.status === 409) {
        setCardErrors((prev) => ({ ...prev, [weekId]: "Already running" }));
        await refresh();
        return;
      }

      if (!res.ok) {
        setCardErrors((prev) => ({
          ...prev,
          [weekId]: json.error || "Failed to queue run",
        }));
        return;
      }

      if (json.warning) {
        setCardErrors((prev) => ({ ...prev, [weekId]: json.warning }));
      }

      // Optimistically merge the updated week so the badge flips
      // immediately, then let polling take over from here.
      const updatedWeek = json.data?.week as WeekBoardRow | undefined;
      if (updatedWeek) {
        setWeeks((prev) =>
          prev.map((w) =>
            w.id === weekId
              ? { ...w, ...updatedWeek, company: w.company, current_job: json.data.job }
              : w
          )
        );
      }
      scheduleNextPoll();
    } catch {
      setCardErrors((prev) => ({ ...prev, [weekId]: "Failed to queue run" }));
    } finally {
      setPendingWeekId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Week Board</h1>
        <button
          onClick={refresh}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Refresh now
        </button>
      </div>

      {listError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {listError}
        </div>
      )}

      {weeks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No weeks found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weeks.map((week) => (
            <WeekCard
              key={week.id}
              week={week}
              pending={pendingWeekId === week.id}
              errorMessage={cardErrors[week.id]}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="text-xs text-gray-400">
          {hiddenCount} row{hiddenCount === 1 ? "" : "s"} hidden (parser
          artefacts, for example stray &quot;VERSION HISTORY&quot; entries).
        </p>
      )}
    </div>
  );
}

interface WeekCardProps {
  week: WeekBoardRow;
  pending: boolean;
  errorMessage?: string;
  onAction: (weekId: string, mode: RunMode) => void;
}

function WeekCard({ week, pending, errorMessage, onAction }: WeekCardProps) {
  const meta = RUN_STATE_META[week.run_state];
  const isActive = ACTIVE_RUN_STATES.includes(week.run_state);
  const job = week.current_job;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {week.company?.name || "Unknown company"} &middot; {weekLabel(week)}
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-gray-900">
            {week.title || "Untitled"}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatDateRange(week.date_start, week.date_end)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
          {meta.label}
        </span>
      </div>

      {week.run_state === "running" && week.current_phase && (
        <p className="text-xs text-amber-800">{week.current_phase}</p>
      )}

      {week.run_state === "failed" && week.last_error && (
        <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {week.last_error}
        </p>
      )}

      {errorMessage && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{formatTimestamp(week.last_run_at)}</span>
        {job && (
          <span>
            Attempt {job.attempt ?? 1} of {job.max_attempts ?? 3}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {isActive ? (
          <span className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">
            {meta.label}&hellip;
          </span>
        ) : week.run_state === "failed" ? (
          <>
            <button
              onClick={() => onAction(week.id, "resume")}
              disabled={pending}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {pending ? "Queuing…" : "Resume"}
            </button>
            <button
              onClick={() => onAction(week.id, "fresh")}
              disabled={pending}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Fresh
            </button>
          </>
        ) : (
          <button
            onClick={() => onAction(week.id, "fresh")}
            disabled={pending}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {pending ? "Queuing…" : "Run"}
          </button>
        )}

        <a
          href={`/api/export/metricool?weekId=${week.id}`}
          className="ml-auto text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          Download CSV
        </a>
      </div>
    </div>
  );
}
