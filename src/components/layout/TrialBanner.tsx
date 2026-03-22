"use client";

import Link from "next/link";

interface TrialBannerProps {
  daysRemaining: number;
}

export default function TrialBanner({ daysRemaining }: TrialBannerProps) {
  const urgency = daysRemaining <= 2;

  return (
    <div
      className={`flex items-center justify-between px-6 py-2.5 text-sm ${
        urgency
          ? "bg-amber-50 border-b border-amber-200 text-amber-800"
          : "bg-violet-50 border-b border-violet-200 text-violet-800"
      }`}
    >
      <p>
        <span className="font-semibold">
          {daysRemaining === 1
            ? "1 day left"
            : `${daysRemaining} days left`}
        </span>{" "}
        in your free trial.{" "}
        {urgency && "Upgrade now to keep your Pro features."}
      </p>
      <Link
        href="/pricing"
        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
          urgency
            ? "bg-amber-600 text-white hover:bg-amber-700"
            : "bg-violet-600 text-white hover:bg-violet-700"
        }`}
      >
        Upgrade
      </Link>
    </div>
  );
}
