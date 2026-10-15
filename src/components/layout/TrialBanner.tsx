"use client";

interface TrialBannerProps {
  daysRemaining: number;
}

export default function TrialBanner({ daysRemaining }: TrialBannerProps) {
  const urgency = daysRemaining <= 2;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm md:px-6 ${
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
        {urgency && "Talk to us to keep everything working."}
      </p>
      <a
        href="mailto:mct@agencybristol.com?subject=Content%20platform%20plan"
        className={`inline-flex min-h-[44px] shrink-0 items-center rounded-md px-3 text-xs font-semibold transition-colors ${
          urgency
            ? "bg-amber-600 text-white hover:bg-amber-700"
            : "bg-violet-600 text-white hover:bg-violet-700"
        }`}
      >
        Talk to us about your plan
      </a>
    </div>
  );
}
