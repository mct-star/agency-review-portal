"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Spokesperson {
  id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  is_primary: boolean;
}

interface ContentSetupSelectorProps {
  companyId: string;
  companyName: string;
  brandColor: string | null;
  logoUrl: string | null;
}

export default function ContentSetupSelector({
  companyId,
  companyName,
  brandColor,
  logoUrl,
}: ContentSetupSelectorProps) {
  const [spokespersons, setSpokespersons] = useState<Spokesperson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSpokespersons() {
      try {
        const res = await fetch(
          `/api/config/spokespersons?companyId=${companyId}`
        );
        if (res.ok) {
          const json = await res.json();
          setSpokespersons(json.data || []);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchSpokespersons();
  }, [companyId]);

  const accent = brandColor || "#0ea5e9";

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your brand voice and content strategy
        </p>
      </div>

      {/* Profile cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Choose a profile to configure
        </h2>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-gray-200 bg-white p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-gray-200" />
                    <div className="h-3 w-24 rounded bg-gray-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Company card */}
            <Link
              href={`/setup/content/${companyId}/brand`}
              className="group rounded-xl border border-gray-200 bg-white overflow-hidden transition-all hover:shadow-lg hover:border-gray-300"
            >
              <div
                className="h-1.5"
                style={{ backgroundColor: accent }}
              />
              <div className="p-6">
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={companyName}
                      className="h-12 w-12 rounded-lg object-contain border border-gray-100"
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: accent }}
                    >
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 group-hover:text-sky-700">
                      {companyName}
                    </h3>
                    <p className="text-sm text-gray-500">Company Page</p>
                  </div>
                  <svg
                    className="h-5 w-5 text-gray-300 group-hover:text-sky-500 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Spokesperson cards */}
            {spokespersons.map((person) => (
              <Link
                key={person.id}
                href={`/setup/content/${companyId}/person/${person.id}`}
                className="group rounded-xl border border-gray-200 bg-white overflow-hidden transition-all hover:shadow-lg hover:border-gray-300"
              >
                <div
                  className="h-1.5"
                  style={{ backgroundColor: accent }}
                />
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    {person.profile_picture_url ? (
                      <img
                        src={person.profile_picture_url}
                        alt={person.name}
                        className="h-12 w-12 rounded-full object-cover border border-gray-100"
                      />
                    ) : (
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {getInitials(person.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 group-hover:text-sky-700">
                        {person.name}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {person.tagline || "Spokesperson"}
                      </p>
                    </div>
                    <svg
                      className="h-5 w-5 text-gray-300 group-hover:text-sky-500 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}

            {spokespersons.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center col-span-full sm:col-span-1">
                <p className="text-sm text-gray-400">
                  No spokespersons configured yet.
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Add people in Company Settings.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Company Settings link */}
      <div className="border-t border-gray-200 pt-6">
        <Link
          href={`/setup/${companyId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Company Settings
          <span className="text-xs text-gray-400">
            Logo, URLs, API keys, social accounts
          </span>
        </Link>
      </div>
    </div>
  );
}
