import Link from "next/link";
import type { Metadata } from "next";
import { NOT_FOR_VENUE } from "@/lib/hospitality/b2b-only";

export const metadata: Metadata = { title: "Not part of your tools | AGENCY" };

/**
 * Where a hospitality venue lands if it types the address of a business-to-business
 * page. The layout sends it here; see lib/hospitality/b2b-only.ts.
 */
export default function NotAvailablePage() {
  return (
    <div className="mx-auto max-w-xl space-y-5 pt-6 md:pt-12">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{NOT_FOR_VENUE.title}</h1>
      <p className="text-sm text-gray-700">{NOT_FOR_VENUE.body}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/home"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
        >
          Back to Home
        </Link>
        <Link
          href="/generate/quick"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
        >
          Write a post
        </Link>
      </div>
    </div>
  );
}
