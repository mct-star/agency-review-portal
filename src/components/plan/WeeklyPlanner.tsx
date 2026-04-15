"use client";

import { useState, useCallback } from "react";
import { POST_TYPES } from "@/lib/constants/post-types";
import type { PostType, PostingSlotWithType } from "@/types/database";

// ── Constants ────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_TIMES: Record<string, string> = {
  morning: "08:26:00",
  midday: "12:02:00",
  weekend: "10:30:00",
};

// Show Mon-Sun (index 1-6, 0)
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Map post-type slugs to colour classes for dots
const SLUG_COLORS: Record<string, string> = {
  insight: "bg-[#CDD856]",
  launch_story: "bg-[#41CDA9]",
  if_i_was: "bg-[#A27BF9]",
  contrarian: "bg-[#41C9FE]",
  tactical: "bg-[#CDD856]",
  founder_friday: "bg-[#F59E0B]",
  blog_teaser: "bg-[#059669]",
  personal_update: "bg-[#E11D48]",
  scene_provocation: "bg-[#1E3A5F]",
};

function getSlugColor(slug: string): string {
  return SLUG_COLORS[slug] || "bg-gray-400";
}

// ── Props ────────────────────────────────────────────────────

interface WeeklyPlannerProps {
  companyId: string;
  companyName: string;
  initialSlots: PostingSlotWithType[];
  initialPostTypes: PostType[];
}

// ── Component ────────────────────────────────────────────────

export default function WeeklyPlanner({
  companyId,
  companyName,
  initialSlots,
  initialPostTypes,
}: WeeklyPlannerProps) {
  const [slots, setSlots] = useState<PostingSlotWithType[]>(initialSlots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [addingToDay, setAddingToDay] = useState<number | null>(null);

  // Group active slots by day
  const slotsByDay: Record<number, PostingSlotWithType[]> = {};
  for (let d = 0; d < 7; d++) slotsByDay[d] = [];
  for (const slot of slots) {
    if (slot.is_active) {
      slotsByDay[slot.day_of_week]?.push(slot);
    }
  }
  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) =>
      a.scheduled_time.localeCompare(b.scheduled_time)
    );
  }

  // Find matching POST_TYPES entry for ecosystem role info
  function getPostTypeInfo(slug: string) {
    return POST_TYPES.find((pt) => pt.slug === slug);
  }

  function formatTime(time: string): string {
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? "pm" : "am";
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:${m}${suffix}`;
  }

  // Refetch slots from the API
  const refetchSlots = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/config/posting-schedule?companyId=${companyId}`
      );
      const json = await res.json();
      if (res.ok) {
        setSlots(json.data?.slots || []);
      }
    } catch {
      // silent
    }
  }, [companyId]);

  // Add a slot
  async function addSlot(postType: PostType, dayOfWeek: number) {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const defaultTime = isWeekend ? DEFAULT_TIMES.weekend : DEFAULT_TIMES.morning;

    try {
      const res = await fetch("/api/config/posting-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          postTypeId: postType.id,
          dayOfWeek,
          scheduledTime: defaultTime,
          slotLabel: `${DAY_SHORT[dayOfWeek]} ${defaultTime < "12:00" ? "AM" : "PM"}`,
          imageArchetype: postType.default_image_archetype || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      setAddingToDay(null);
      setSuccessMsg("Slot added");
      setTimeout(() => setSuccessMsg(null), 2000);
      await refetchSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add slot");
    } finally {
      setSaving(false);
    }
  }

  // Remove a slot
  async function removeSlot(slotId: string) {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(
        `/api/config/posting-schedule?id=${slotId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      setSuccessMsg("Slot removed");
      setTimeout(() => setSuccessMsg(null), 2000);
      await refetchSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove slot");
    } finally {
      setSaving(false);
    }
  }

  // Count totals
  const totalActive = slots.filter((s) => s.is_active).length;
  const socialCount = slots.filter(
    (s) => s.is_active && s.post_types?.content_type === "social_post"
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-3">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500">Company</p>
            <p className="text-sm font-semibold text-gray-900">{companyName}</p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <p className="text-xs font-medium text-gray-500">Posts per week</p>
            <p className="text-sm font-semibold text-gray-900">{totalActive}</p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <p className="text-xs font-medium text-gray-500">Social</p>
            <p className="text-sm font-semibold text-gray-900">{socialCount}</p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <p className="text-xs font-medium text-gray-500">Long-form</p>
            <p className="text-sm font-semibold text-gray-900">
              {totalActive - socialCount}
            </p>
          </div>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            Saving...
          </div>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700">{successMsg}</p>
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-3">
        {DISPLAY_ORDER.map((dayIndex) => {
          const daySlots = slotsByDay[dayIndex] || [];
          const isWeekend = dayIndex === 0 || dayIndex === 6;

          return (
            <div
              key={dayIndex}
              className={`rounded-lg border bg-white ${
                isWeekend ? "border-gray-150 bg-gray-50/30" : "border-gray-200"
              }`}
            >
              {/* Day header */}
              <div className="border-b border-gray-100 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900">
                    {DAY_NAMES[dayIndex]}
                  </span>
                  {daySlots.length > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-500">
                      {daySlots.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Slot cards */}
              <div className="space-y-2 p-2">
                {daySlots.map((slot) => {
                  const dbType = slot.post_types;
                  const info = getPostTypeInfo(dbType?.slug || "");

                  return (
                    <div
                      key={slot.id}
                      className="group relative rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-sm"
                    >
                      {/* Remove button */}
                      <button
                        onClick={() => removeSlot(slot.id)}
                        disabled={saving}
                        className="absolute top-1.5 right-1.5 hidden rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500 group-hover:block disabled:opacity-50"
                        title="Remove slot"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>

                      {/* Colour dot + label */}
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${getSlugColor(
                            dbType?.slug || ""
                          )}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-tight text-gray-900">
                            {info?.label || dbType?.label || "Unknown"}
                          </p>
                          <p className="mt-0.5 text-[10px] text-gray-500">
                            {formatTime(slot.scheduled_time)}
                          </p>
                        </div>
                      </div>

                      {/* Ecosystem role */}
                      {info?.ecosystemRole && (
                        <p className="mt-1.5 text-[10px] leading-snug text-gray-500">
                          {info.ecosystemRole}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Add slot button */}
                <button
                  onClick={() =>
                    setAddingToDay(addingToDay === dayIndex ? null : dayIndex)
                  }
                  disabled={saving}
                  className={`w-full rounded-lg border border-dashed p-2.5 text-center text-xs font-medium transition-colors ${
                    addingToDay === dayIndex
                      ? "border-blue-400 bg-blue-50 text-blue-600"
                      : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-500"
                  } disabled:opacity-50`}
                >
                  + Add slot
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Post type picker */}
      {addingToDay !== null && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Add to {DAY_NAMES[addingToDay]}
            </h3>
            <button
              onClick={() => setAddingToDay(null)}
              className="text-xs text-gray-500 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {POST_TYPES.map((pt) => {
              // Find the DB post type by slug
              const dbType = initialPostTypes.find(
                (t) => t.slug === pt.slug
              );
              if (!dbType) return null;

              return (
                <button
                  key={pt.slug}
                  onClick={() => addSlot(dbType, addingToDay)}
                  disabled={saving}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
                >
                  <div
                    className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full ${getSlugColor(
                      pt.slug
                    )}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900">
                      {pt.label}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
                      {pt.ecosystemRole}
                    </p>
                    {pt.weekdayHint && (
                      <p className="mt-1 text-[10px] text-gray-500">
                        Suggested: {pt.weekdayHint}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Narrative arc legend */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Narrative Arc
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          Each post type plays a role in your weekly content ecosystem. A strong
          week opens with a problem, builds credibility through stories, delivers
          value mid-week, and closes with something human.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {POST_TYPES.map((pt) => (
            <div
              key={pt.slug}
              className="flex items-start gap-2 rounded-md border border-gray-100 px-3 py-2"
            >
              <div
                className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${getSlugColor(
                  pt.slug
                )}`}
              />
              <div>
                <p className="text-xs font-medium text-gray-800">{pt.label}</p>
                <p className="text-[10px] text-gray-500">
                  {pt.weekdayHint ? `${pt.weekdayHint} ` : ""}
                  {pt.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
