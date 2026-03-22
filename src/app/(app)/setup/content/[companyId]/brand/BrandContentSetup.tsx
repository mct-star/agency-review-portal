"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import QuickStrategySetup from "@/components/setup/QuickStrategySetup";

type PlanTier = "free" | "starter" | "pro" | "agency";
const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
};

interface BrandContentSetupProps {
  companyId: string;
  companyName: string;
  companyPlan: string;
}

const TABS = [
  { key: "voice", label: "Voice", minPlan: "starter" as PlanTier },
  { key: "topics", label: "Topics", minPlan: "starter" as PlanTier },
  { key: "schedule", label: "Schedule", minPlan: "pro" as PlanTier },
  { key: "signoffs", label: "Sign-offs", minPlan: "pro" as PlanTier },
  { key: "strategy", label: "Strategy", minPlan: "free" as PlanTier },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function BrandContentSetup({
  companyId,
  companyName,
  companyPlan,
}: BrandContentSetupProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("strategy");
  const planRank = PLAN_RANK[(companyPlan as PlanTier) || "free"] ?? 0;

  function isTabLocked(tab: (typeof TABS)[number]): boolean {
    return planRank < (PLAN_RANK[tab.minPlan] ?? 0);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/setup/content"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            &larr; Back to Content Setup
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            Brand Page Content Setup
          </h1>
          <p className="text-sm text-gray-500">{companyName}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 overflow-x-auto">
          {TABS.map((tab) => {
            const locked = isTabLocked(tab);
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-sky-500 text-sky-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {locked && (
                    <svg
                      className="h-3.5 w-3.5 text-gray-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {isTabLocked(TABS.find((t) => t.key === activeTab)!) ? (
          <UpgradeMessage
            tabName={TABS.find((t) => t.key === activeTab)!.label}
            requiredPlan={TABS.find((t) => t.key === activeTab)!.minPlan}
          />
        ) : (
          <>
            {activeTab === "voice" && <VoiceTab companyId={companyId} />}
            {activeTab === "topics" && <TopicsTab companyId={companyId} />}
            {activeTab === "schedule" && <ScheduleTab companyId={companyId} />}
            {activeTab === "signoffs" && <SignoffsTab companyId={companyId} />}
            {activeTab === "strategy" && (
              <StrategyTab
                companyId={companyId}
                companyName={companyName}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upgrade Message                                                    */
/* ------------------------------------------------------------------ */

function UpgradeMessage({
  tabName,
  requiredPlan,
}: {
  tabName: string;
  requiredPlan: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
      <svg
        className="mx-auto h-12 w-12 text-gray-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">
        {tabName} requires the {requiredPlan} plan
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        Upgrade your plan to access {tabName.toLowerCase()} configuration.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Voice Tab                                                          */
/* ------------------------------------------------------------------ */

function VoiceTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceDescription, setVoiceDescription] = useState("");
  const [toneKeywords, setToneKeywords] = useState("");
  const [writingStyleNotes, setWritingStyleNotes] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchVoice() {
      try {
        const res = await fetch(`/api/config/voice?companyId=${companyId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setVoiceDescription(json.data.voice_description || "");
            // Extract tone keywords and style notes from raw_analysis if available
            const raw = json.data.raw_analysis || {};
            setToneKeywords(
              raw.tone_keywords ||
                (json.data.emotional_register
                  ? JSON.stringify(json.data.emotional_register)
                  : "")
            );
            setWritingStyleNotes(
              raw.writing_style_notes ||
                (json.data.signature_devices
                  ? JSON.stringify(json.data.signature_devices)
                  : "")
            );
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchVoice();
  }, [companyId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/config/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          voice_description: voiceDescription,
          raw_analysis: {
            tone_keywords: toneKeywords,
            writing_style_notes: writingStyleNotes,
          },
          source: "manual",
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Voice Description
        </label>
        <textarea
          value={voiceDescription}
          onChange={(e) => setVoiceDescription(e.target.value)}
          rows={4}
          placeholder="Describe your brand's voice and personality..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tone Keywords
        </label>
        <input
          type="text"
          value={toneKeywords}
          onChange={(e) => setToneKeywords(e.target.value)}
          placeholder="e.g. authoritative, warm, pragmatic, direct"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <p className="mt-1 text-xs text-gray-400">
          Comma-separated keywords that define your tone
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Writing Style Notes
        </label>
        <textarea
          value={writingStyleNotes}
          onChange={(e) => setWritingStyleNotes(e.target.value)}
          rows={3}
          placeholder="Any specific style guidelines, banned words, or preferences..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Voice Profile"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Topics Tab (read-only)                                             */
/* ------------------------------------------------------------------ */

interface Topic {
  id: string;
  topic_number: number;
  title: string;
  pillar: string | null;
  audience_theme: string | null;
  description: string | null;
}

function TopicsTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    async function fetchTopics() {
      try {
        const res = await fetch(
          `/api/config/topic-bank?companyId=${companyId}`
        );
        if (res.ok) {
          const json = await res.json();
          setTopics(json.data || []);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchTopics();
  }, [companyId]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <p className="text-sm text-amber-700">
          Topic bank is read-only here. Manage topics in{" "}
          <Link
            href={`/setup/${companyId}/topics`}
            className="font-medium underline"
          >
            Company Settings
          </Link>
          .
        </p>
      </div>

      {topics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-400">No topics configured yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Pillar
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Theme
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {topics.map((topic) => (
                <tr key={topic.id}>
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                    {topic.topic_number}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {topic.title}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                    {topic.pillar || "-"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                    {topic.audience_theme || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Schedule Tab (read-only)                                           */
/* ------------------------------------------------------------------ */

interface PostingSlot {
  id: string;
  day_of_week: number;
  scheduled_time: string;
  slot_label: string | null;
  post_types: { name: string; slug: string } | null;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function ScheduleTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<PostingSlot[]>([]);

  useEffect(() => {
    async function fetchSchedule() {
      try {
        const res = await fetch(
          `/api/config/posting-schedule?companyId=${companyId}`
        );
        if (res.ok) {
          const json = await res.json();
          setSlots(json.data?.slots || []);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchSchedule();
  }, [companyId]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <p className="text-sm text-amber-700">
          Posting schedule is read-only here. Manage schedule in{" "}
          <Link
            href={`/setup/${companyId}/schedule`}
            className="font-medium underline"
          >
            Company Settings
          </Link>
          .
        </p>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-400">
            No posting schedule configured yet.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Day
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Label
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                    {DAY_NAMES[slot.day_of_week] || slot.day_of_week}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                    {slot.scheduled_time}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                    {slot.post_types?.name || "-"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {slot.slot_label || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sign-offs Tab (read-only)                                          */
/* ------------------------------------------------------------------ */

interface Signoff {
  id: string;
  label: string;
  signoff_text: string;
  first_comment_template: string | null;
}

function SignoffsTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);

  useEffect(() => {
    async function fetchSignoffs() {
      try {
        const res = await fetch(
          `/api/config/signoffs?companyId=${companyId}`
        );
        if (res.ok) {
          const json = await res.json();
          setSignoffs(json.data || []);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchSignoffs();
  }, [companyId]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      {signoffs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-400">
            No sign-offs configured yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {signoffs.map((signoff) => (
            <div
              key={signoff.id}
              className="rounded-lg border border-gray-200 bg-white p-5"
            >
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                {signoff.label}
              </h4>
              <div className="rounded bg-gray-50 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
                {signoff.signoff_text}
              </div>
              {signoff.first_comment_template && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    First Comment
                  </p>
                  <div className="rounded bg-gray-50 px-4 py-3 text-sm text-gray-600 whitespace-pre-wrap">
                    {signoff.first_comment_template}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Strategy Tab                                                       */
/* ------------------------------------------------------------------ */

function StrategyTab({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  return (
    <div className="space-y-6">
      <QuickStrategySetup
        companyId={companyId}
        companyName={companyName}
        completedItems={0}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-48 rounded bg-gray-200" />
      <div className="h-20 rounded-lg bg-gray-100" />
      <div className="h-20 rounded-lg bg-gray-100" />
    </div>
  );
}
