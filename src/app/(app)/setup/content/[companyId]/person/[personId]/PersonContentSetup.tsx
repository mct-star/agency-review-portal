"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type PlanTier = "free" | "starter" | "pro" | "agency";
const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
};

interface PersonContentSetupProps {
  companyId: string;
  personId: string;
  companyPlan: string;
}

interface PersonData {
  id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  linkedin_url: string | null;
}

interface PersonSetup {
  topic_assignments: string[] | null;
  posting_schedule: Record<string, unknown> | null;
  signoff_template: string | null;
  content_strategy: string | null;
}

interface Topic {
  id: string;
  topic_number: number;
  title: string;
  pillar: string | null;
}

const TABS = [
  { key: "voice", label: "Voice", minPlan: "starter" as PlanTier },
  { key: "topics", label: "Topics", minPlan: "starter" as PlanTier },
  { key: "schedule", label: "Schedule", minPlan: "pro" as PlanTier },
  { key: "signoffs", label: "Sign-offs", minPlan: "pro" as PlanTier },
  { key: "strategy", label: "Strategy", minPlan: "free" as PlanTier },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PersonContentSetup({
  companyId,
  personId,
  companyPlan,
}: PersonContentSetupProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("strategy");
  const [person, setPerson] = useState<PersonData | null>(null);
  const [loading, setLoading] = useState(true);
  const planRank = PLAN_RANK[(companyPlan as PlanTier) || "free"] ?? 0;

  useEffect(() => {
    async function fetchPerson() {
      try {
        const res = await fetch(
          `/api/config/spokespersons?companyId=${companyId}`
        );
        if (res.ok) {
          const json = await res.json();
          const found = (json.data || []).find(
            (p: PersonData) => p.id === personId
          );
          if (found) setPerson(found);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchPerson();
  }, [companyId, personId]);

  function isTabLocked(tab: (typeof TABS)[number]): boolean {
    return planRank < (PLAN_RANK[tab.minPlan] ?? 0);
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="h-16 rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-gray-500">Spokesperson not found.</p>
        <Link
          href="/setup/content"
          className="mt-2 text-sm text-sky-600 hover:underline"
        >
          Back to Content Setup
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/setup/content"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back to Content Setup
        </Link>
        <div className="mt-2 flex items-center gap-4">
          {person.profile_picture_url ? (
            <img
              src={person.profile_picture_url}
              alt={person.name}
              className="h-14 w-14 rounded-full object-cover border-2 border-gray-200"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-lg font-bold text-sky-700">
              {getInitials(person.name)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{person.name}</h1>
            <p className="text-sm text-gray-500">
              {person.tagline || "Spokesperson"}
            </p>
          </div>
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
            {activeTab === "voice" && (
              <PersonVoiceTab
                companyId={companyId}
                personId={personId}
                personName={person.name}
                linkedinUrl={person.linkedin_url}
              />
            )}
            {activeTab === "topics" && (
              <PersonTopicsTab
                companyId={companyId}
                personId={personId}
              />
            )}
            {activeTab === "schedule" && (
              <PersonScheduleTab
                companyId={companyId}
                personId={personId}
              />
            )}
            {activeTab === "signoffs" && (
              <PersonSignoffsTab
                companyId={companyId}
                personId={personId}
              />
            )}
            {activeTab === "strategy" && (
              <PersonStrategyTab
                companyId={companyId}
                personId={personId}
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
/*  Person Voice Tab                                                   */
/* ------------------------------------------------------------------ */

function PersonVoiceTab({
  companyId,
  personId,
  personName,
  linkedinUrl,
}: {
  companyId: string;
  personId: string;
  personName: string;
  linkedinUrl: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPersonalVoice, setHasPersonalVoice] = useState(false);
  const [voiceDescription, setVoiceDescription] = useState("");
  const [toneKeywords, setToneKeywords] = useState("");
  const [writingStyleNotes, setWritingStyleNotes] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchVoice() {
      try {
        const res = await fetch(
          `/api/config/voice?companyId=${companyId}&spokespersonId=${personId}`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setHasPersonalVoice(true);
            setVoiceDescription(json.data.voice_description || "");
            const raw = json.data.raw_analysis || {};
            setToneKeywords(raw.tone_keywords || "");
            setWritingStyleNotes(raw.writing_style_notes || "");
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchVoice();
  }, [companyId, personId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/config/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          spokespersonId: personId,
          voice_description: voiceDescription,
          raw_analysis: {
            tone_keywords: toneKeywords,
            writing_style_notes: writingStyleNotes,
          },
          source: "manual",
        }),
      });
      if (res.ok) {
        setHasPersonalVoice(true);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSkeleton />;

  if (!hasPersonalVoice) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3">
          <p className="text-sm text-sky-700">
            {personName} is currently using the company default voice profile.
          </p>
        </div>
        <button
          onClick={() => setHasPersonalVoice(true)}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700"
        >
          Create Personal Voice Profile
        </button>
        {linkedinUrl && (
          <p className="text-xs text-gray-400">
            LinkedIn profile available for voice scanning: {linkedinUrl}
          </p>
        )}
      </div>
    );
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
          placeholder={`Describe ${personName}'s voice and personality...`}
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
          placeholder="e.g. authoritative, warm, pragmatic"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Writing Style Notes
        </label>
        <textarea
          value={writingStyleNotes}
          onChange={(e) => setWritingStyleNotes(e.target.value)}
          rows={3}
          placeholder="Any specific style guidelines or preferences..."
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
/*  Person Topics Tab                                                  */
/* ------------------------------------------------------------------ */

function PersonTopicsTab({
  companyId,
  personId,
}: {
  companyId: string;
  personId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [topicsRes, personRes] = await Promise.all([
          fetch(`/api/config/topic-bank?companyId=${companyId}`),
          fetch(
            `/api/config/person-setup?companyId=${companyId}&personId=${personId}`
          ),
        ]);

        if (topicsRes.ok) {
          const topicsJson = await topicsRes.json();
          setTopics(topicsJson.data || []);
        }

        if (personRes.ok) {
          const personJson = await personRes.json();
          setSelectedTopicIds(personJson.data?.topic_assignments || []);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [companyId, personId]);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId]
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(
        `/api/config/person-setup?companyId=${companyId}&personId=${personId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic_assignments: selectedTopicIds }),
        }
      );
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

  if (loading) return <LoadingSkeleton />;

  if (topics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-400">
          No topics in the company topic bank yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select the topics this person covers. Unchecked topics will use the
        company default assignment.
      </p>

      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
        {topics.map((topic) => (
          <label
            key={topic.id}
            className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 hover:bg-gray-50 cursor-pointer last:border-b-0"
          >
            <input
              type="checkbox"
              checked={selectedTopicIds.includes(topic.id)}
              onChange={() => toggleTopic(topic.id)}
              className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-sm text-gray-500 w-8">
              #{topic.topic_number}
            </span>
            <span className="text-sm text-gray-900 flex-1">{topic.title}</span>
            {topic.pillar && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {topic.pillar}
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Topic Assignments"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
        <span className="text-xs text-gray-400">
          {selectedTopicIds.length} of {topics.length} selected
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Person Schedule Tab                                                */
/* ------------------------------------------------------------------ */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function PersonScheduleTab({
  companyId,
  personId,
}: {
  companyId: string;
  personId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [scheduleJson, setScheduleJson] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `/api/config/person-setup?companyId=${companyId}&personId=${personId}`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.data?.posting_schedule) {
            setHasOverride(true);
            setScheduleJson(
              JSON.stringify(json.data.posting_schedule, null, 2)
            );
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [companyId, personId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      let parsed = null;
      if (scheduleJson.trim()) {
        parsed = JSON.parse(scheduleJson);
      }
      const res = await fetch(
        `/api/config/person-setup?companyId=${companyId}&personId=${personId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posting_schedule: parsed }),
        }
      );
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

  if (loading) return <LoadingSkeleton />;

  if (!hasOverride) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3">
          <p className="text-sm text-sky-700">
            This person is using the company default posting schedule.
          </p>
        </div>
        <button
          onClick={() => setHasOverride(true)}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700"
        >
          Create Personal Schedule Override
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Define a custom posting schedule for this person. Use JSON format with
        day/time/type entries.
      </p>
      <textarea
        value={scheduleJson}
        onChange={(e) => setScheduleJson(e.target.value)}
        rows={10}
        placeholder='[{"day": "Monday", "time": "08:00", "type": "thought-leadership"}]'
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Schedule"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
        <button
          onClick={() => {
            setScheduleJson("");
            setHasOverride(false);
          }}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Revert to company default
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Person Sign-offs Tab                                               */
/* ------------------------------------------------------------------ */

function PersonSignoffsTab({
  companyId,
  personId,
}: {
  companyId: string;
  personId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const [signoffTemplate, setSignoffTemplate] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `/api/config/person-setup?companyId=${companyId}&personId=${personId}`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.data?.signoff_template) {
            setHasOverride(true);
            setSignoffTemplate(json.data.signoff_template);
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [companyId, personId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(
        `/api/config/person-setup?companyId=${companyId}&personId=${personId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signoff_template: signoffTemplate || null,
          }),
        }
      );
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

  if (loading) return <LoadingSkeleton />;

  if (!hasOverride) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3">
          <p className="text-sm text-sky-700">
            This person is using the company default sign-offs.
          </p>
        </div>
        <button
          onClick={() => setHasOverride(true)}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700"
        >
          Create Personal Sign-off
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Sign-off Template
        </label>
        <textarea
          value={signoffTemplate}
          onChange={(e) => setSignoffTemplate(e.target.value)}
          rows={5}
          placeholder="e.g. Enjoy this? Repost to share with your network..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Sign-off"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
        <button
          onClick={() => {
            setSignoffTemplate("");
            setHasOverride(false);
          }}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Revert to company default
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Person Strategy Tab                                                */
/* ------------------------------------------------------------------ */

function PersonStrategyTab({
  companyId,
  personId,
}: {
  companyId: string;
  personId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contentStrategy, setContentStrategy] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `/api/config/person-setup?companyId=${companyId}&personId=${personId}`
        );
        if (res.ok) {
          const json = await res.json();
          setContentStrategy(json.data?.content_strategy || "");
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [companyId, personId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(
        `/api/config/person-setup?companyId=${companyId}&personId=${personId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_strategy: contentStrategy || null,
          }),
        }
      );
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

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Personal Content Strategy
        </label>
        <p className="text-sm text-gray-500 mb-2">
          Notes on this person&apos;s content focus, themes, and strategic
          direction.
        </p>
        <textarea
          value={contentStrategy}
          onChange={(e) => setContentStrategy(e.target.value)}
          rows={8}
          placeholder="Describe this person's content strategy, key themes they focus on, and any strategic notes..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Strategy"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully</span>
        )}
      </div>
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
