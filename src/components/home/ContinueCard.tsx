"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLastActivity, clearLastActivity } from "@/lib/utils/last-activity";

export default function ContinueCard() {
  const [activity, setActivity] = useState<ReturnType<typeof getLastActivity>>(null);

  useEffect(() => {
    setActivity(getLastActivity());
  }, []);

  if (!activity) return null;

  const timeAgo = Math.round((Date.now() - activity.timestamp) / (1000 * 60));
  const timeLabel = timeAgo < 60
    ? `${timeAgo}m ago`
    : timeAgo < 1440
    ? `${Math.round(timeAgo / 60)}h ago`
    : "yesterday";

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
            <svg className="h-4 w-4 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Continue: {activity.label}</p>
            <p className="text-xs text-gray-500">{timeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={activity.href}
            className="rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
          >
            Continue &rarr;
          </Link>
          <button
            onClick={() => { clearLastActivity(); setActivity(null); }}
            className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:text-gray-600 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
