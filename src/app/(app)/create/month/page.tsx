import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Month Batch | AGENCY",
  description: "Generate an entire month of content",
};

export default function MonthBatchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Month Batch Generation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate an entire month of strategically-linked content in one go.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-7 w-7 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 5a2 2 0 0 1 2-2h2V2a1 1 0 1 1 2 0v1h6V2a1 1 0 1 1 2 0v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm16 4H5v10h14V9ZM7 11h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2ZM7 15h2v2H7v-2Zm4 0h2v2h-2v-2Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Coming Soon</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
          This feature is coming soon. In the meantime, use Week Batch to generate
          content week by week.
        </p>
        <Link
          href="/generate"
          className="mt-6 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          Go to Week Batch &rarr;
        </Link>
      </div>
    </div>
  );
}
