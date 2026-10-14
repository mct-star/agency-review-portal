"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moveErrorText } from "@/lib/hospitality/week-view";

export interface DayListPost {
  id: string;
  title: string;
  status: string;
  time: string | null;
  date: string;
}

export interface DayListDay {
  date: string;
  label: string;
  isToday: boolean;
  posts: DayListPost[];
}

const STATUS: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "Waiting for you", className: "bg-amber-100 text-amber-900" },
  changes_requested: { label: "Being changed", className: "bg-sky-100 text-sky-800" },
};

/** The next fortnight for a venue, one day under another, with a Move button on each post. */
export default function DayList({ days, firstDate }: { days: DayListDay[]; firstDate: string }) {
  return (
    <ol className="space-y-4">
      {days.map((day) => (
        <li key={day.date} className={`rounded-lg border bg-white p-4 ${day.isToday ? "border-violet-300" : "border-gray-200"}`}>
          <h2 className="text-sm font-semibold text-gray-900">{day.label}</h2>
          {day.posts.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No posts.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {day.posts.map((p) => <PostRow key={p.id} post={p} firstDate={firstDate} />)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function PostRow({ post, firstDate }: { post: DayListPost; firstDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(post.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[post.status] || { label: "Draft", className: "bg-gray-100 text-gray-700" };

  async function save() {
    if (!date || date === post.date) { setOpen(false); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/reschedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId: post.id, date }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(moveErrorText(res.status, data.error));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-2">
      <div className="flex min-h-[44px] items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{post.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {post.time && <span>{post.time}</span>}
            <span className={`rounded-full px-2 py-0.5 font-medium ${status.className}`}>{status.label}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(!open); setError(null); setDate(post.date); }}
          aria-expanded={open}
          className="inline-flex min-h-[44px] min-w-[72px] shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {open ? "Cancel" : "Move"}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-gray-50 p-3">
          <label className="block text-sm">
            <span className="block font-medium text-gray-800">New day</span>
            <input
              type="date"
              value={date}
              min={firstDate}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={busy || !date}
            className="inline-flex min-h-[44px] items-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save"}
          </button>
          <p className="w-full text-xs text-gray-500">The post keeps its time.</p>
          {error && <p className="w-full text-sm text-red-700" role="alert">{error}</p>}
        </div>
      )}
    </li>
  );
}
