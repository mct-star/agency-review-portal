"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Spokesperson {
  id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  is_primary: boolean;
}

interface VoiceStatus {
  spokespersonId: string;
  hasVoice: boolean;
  source: string | null;
}

export default function VoiceProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [people, setPeople] = useState<Spokesperson[]>([]);
  const [voiceStatuses, setVoiceStatuses] = useState<VoiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Fetch people
      const peopleRes = await fetch(`/api/config/spokespersons?companyId=${companyId}`);
      const peopleData = await peopleRes.json();
      const peopleList: Spokesperson[] = peopleData.data || [];
      setPeople(peopleList);

      // Fetch voice status for each person
      const statuses = await Promise.all(
        peopleList.map(async (person) => {
          const res = await fetch(`/api/config/voice?companyId=${companyId}&spokespersonId=${person.id}`);
          const data = await res.json();
          return {
            spokespersonId: person.id,
            hasVoice: !!data.data,
            source: data.data?.source || null,
          };
        })
      );
      setVoiceStatuses(statuses);
      setLoading(false);
    }
    load();
  }, [companyId]);

  const getVoiceStatus = (personId: string) => {
    return voiceStatuses.find((v) => v.spokespersonId === personId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Voice Profiles</h2>
        <p className="mt-1 text-sm text-gray-500">
          Each person has their own voice profile that controls how content sounds when written in their name.
          Click a person to configure their voice.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-sky-600" />
        </div>
      ) : people.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">
            Add people first, then configure their voice profiles.
          </p>
          <Link
            href={`/setup/${companyId}/people`}
            className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add People
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {people.map((person) => {
            const status = getVoiceStatus(person.id);
            const initials = person.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

            return (
              <Link
                key={person.id}
                href={`/setup/${companyId}/people/${person.id}`}
                className={`group flex items-center gap-4 rounded-xl border p-4 transition-all hover:shadow-md ${
                  status?.hasVoice
                    ? "border-green-200 bg-green-50/50 hover:border-green-300"
                    : "border-gray-200 bg-white hover:border-sky-300"
                }`}
              >
                {/* Photo */}
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-gray-200">
                  {person.profile_picture_url ? (
                    <img src={person.profile_picture_url} alt={person.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm font-bold text-gray-400">
                      {initials}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{person.name}</h3>
                    {person.is_primary && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-semibold text-sky-700">
                        Primary
                      </span>
                    )}
                  </div>
                  {person.tagline && <p className="text-xs text-gray-500">{person.tagline}</p>}
                </div>

                {/* Voice status */}
                <div className="shrink-0 text-right">
                  {status?.hasVoice ? (
                    <div className="flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs font-medium text-green-600">
                        {status.source === "linkedin_scan" ? "Scanned" : "Configured"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Not configured</span>
                  )}
                </div>

                {/* Arrow */}
                <svg
                  className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Voice profiles define how content sounds when written in someone&apos;s name. Each person can have
          their own voice description, writing samples, signature devices, and banned vocabulary. During
          content generation, the selected spokesperson&apos;s voice profile is injected into the AI prompt
          to ensure authentic, consistent output.
        </p>
      </div>
    </div>
  );
}
