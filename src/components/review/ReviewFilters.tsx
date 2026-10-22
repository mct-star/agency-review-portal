"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Awaiting review", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Changes requested", value: "changes_requested" },
] as const;

export default function ReviewFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedFilter = searchParams.get("status") || "";
  const currentFilter = FILTER_OPTIONS.some(option => option.value === requestedFilter) ? requestedFilter : "";
  const currentSearch = searchParams.get("q") || "";

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="workspace-panel flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
      {/* Search */}
      <form className="relative w-full sm:max-w-xs" onSubmit={(e) => { e.preventDefault(); updateParams("q", new FormData(e.currentTarget).get("q") as string); }}>
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          key={currentSearch}
          name="q"
          type="search"
          aria-label="Search weeks and recent posts"
          placeholder="Search weeks and recent posts"
          defaultValue={currentSearch}
          className="min-h-11 w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-16 text-base text-gray-900 placeholder-gray-500"
        />
        <button type="submit" className="absolute right-1 top-0 min-h-11 px-2 text-xs font-medium text-gray-600">Search</button>
      </form>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1" aria-label="Filter by status">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={currentFilter === option.value}
            onClick={() => updateParams("status", option.value)}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              currentFilter === option.value
                ? "bg-violet-100 text-violet-900"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {(currentFilter || currentSearch) && <button type="button" className="workspace-button workspace-button-quiet" onClick={() => router.push(pathname)}>Clear filters</button>}
    </div>
  );
}
