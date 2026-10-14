"use client";

import { useState } from "react";
import Link from "next/link";

export interface WeekViewPost {
  id: string;
  status: "approved" | "pending";
  title: string;
  caption: string;
  time: string | null;
  imageUrl: string | null;
  /** "Tuesday 14 October": the day it was last changed, which for an approved post is the day it was approved. */
  approvedOn: string | null;
}

export interface WeekViewDay {
  date: string;
  label: string;
  isToday: boolean;
  posts: WeekViewPost[];
}

interface Props {
  weekLabel: string;
  weekStart: string;
  previousHref: string;
  nextHref: string;
  thisWeekHref: string | null;
  days: WeekViewDay[];
  /** The week rows holding this week's approved posts (normally one). */
  weekIds: string[];
  approvedCount: number;
  pendingCount: number;
}

/**
 * A venue's week: what is approved and what is still waiting, day by day,
 * with one button that downloads the approved posts for the scheduling tool.
 */
export default function WeekExport({ weekLabel, weekStart, previousHref, nextHref, thisWeekHref, days, weekIds, approvedCount, pendingCount }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    setNotes([]);
    setDone(false);
    try {
      const collected: string[] = [];
      for (const [i, weekId] of weekIds.entries()) {
        const res = await fetch(`/api/export/metricool?weekId=${encodeURIComponent(weekId)}&draft=false`);
        if (!res.ok) {
          setError(res.status === 404 ? "There are no approved posts to download for this week yet." : "The download did not work. Try again in a moment.");
          return;
        }
        const n = res.headers.get("X-Export-Notes");
        if (n) collected.push(...decodeURIComponent(n).split(" | "));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `posts-week-of-${weekStart}${weekIds.length > 1 ? `-${i + 1}` : ""}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setNotes(collected);
      setDone(true);
    } catch {
      setError("The download did not work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">This week</h1>
        <p className="mt-1 text-sm text-gray-600">{weekLabel}</p>
      </div>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Choose a week">
        <Link href={previousHref} className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Previous week
        </Link>
        {thisWeekHref && (
          <Link href={thisWeekHref} className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            This week
          </Link>
        )}
        <Link href={nextHref} className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Next week
        </Link>
      </nav>

      <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <button
          type="button"
          onClick={download}
          disabled={busy || weekIds.length === 0}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Preparing the file..." : "Download this week's posts"}
        </button>
        <p className="text-sm text-emerald-900">
          The file holds the posts you have approved this week, ready to upload to your scheduling tool for Facebook and Instagram. Each post below shows the day you approved it.
        </p>
        <p className="text-xs text-emerald-800">
          {approvedCount === 0
            ? "Nothing is approved for this week yet, so there is nothing to download."
            : `${approvedCount} approved ${approvedCount === 1 ? "post" : "posts"} will go in the file.`}
          {pendingCount > 0 && ` ${pendingCount} still ${pendingCount === 1 ? "waits" : "wait"} for you and will not be in it.`}
        </p>
        {done && !error && <p className="text-sm font-medium text-emerald-900" role="status">Downloaded. Look in your downloads folder.</p>}
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        {notes.map((n) => <p key={n} className="text-xs text-amber-800">{n}</p>)}
      </section>

      <ol className="space-y-4">
        {days.map((day) => (
          <li key={day.date} className={`rounded-lg border bg-white p-4 ${day.isToday ? "border-violet-300" : "border-gray-200"}`}>
            <h2 className="text-sm font-semibold text-gray-900">{day.label}</h2>
            {day.posts.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No posts.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {day.posts.map((p) =>
                  p.status === "pending" ? (
                    <li key={p.id}>
                      <Link href="/approvals" className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100">
                        <span className="min-w-0">
                          <span className="block font-medium">{p.time ? `${p.time} ` : ""}{p.title}</span>
                          <span className="block text-xs">Waiting for you to approve</span>
                        </span>
                        <span className="shrink-0 font-medium">Look now</span>
                      </Link>
                    </li>
                  ) : (
                    <li key={p.id} className="flex gap-3 rounded-md border border-gray-200 p-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-gray-100 text-center text-xs text-gray-500">No photo</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500">
                          {p.time ? `${p.time}. ` : ""}
                          <span className="font-medium text-emerald-700">Approved</span>
                          {p.approvedOn ? ` ${p.approvedOn}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-800">{p.caption}</p>
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
