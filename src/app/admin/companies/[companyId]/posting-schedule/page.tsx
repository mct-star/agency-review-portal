"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PostType, PostingSlotWithType } from "@/types/database";

// ── Constants ────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_TIMES: Record<string, string> = {
  morning: "08:26:00",
  midday: "12:02:00",
  weekend: "10:30:00",
};

const ARCHETYPE_COLORS: Record<string, string> = {
  A1_green: "bg-green-100 text-green-800 border-green-200",
  A1_purple: "bg-purple-100 text-purple-800 border-purple-200",
  A1_blue: "bg-blue-100 text-blue-800 border-blue-200",
  A2_editorial: "bg-orange-100 text-orange-800 border-orange-200",
  A3B_real_photo: "bg-amber-100 text-amber-800 border-amber-200",
  A4_pixar: "bg-pink-100 text-pink-800 border-pink-200",
  A5_carousel: "bg-cyan-100 text-cyan-800 border-cyan-200",
  A7_infographic: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

// ── Types ────────────────────────────────────────────────────

interface EditingSlot {
  id: string | null; // null = new slot being created
  postTypeId: string;
  dayOfWeek: number;
  scheduledTime: string;
  slotLabel: string;
  imageArchetype: string;
  ctaUrl: string;
  ctaLinkText: string;
}

// ── Main Component ───────────────────────────────────────────

export default function PostingSchedulePage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [slots, setSlots] = useState<PostingSlotWithType[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editingSlot, setEditingSlot] = useState<EditingSlot | null>(null);
  const [addingToDay, setAddingToDay] = useState<number | null>(null);

  // Fetch schedule data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedRes, compRes] = await Promise.all([
        fetch(`/api/config/posting-schedule?companyId=${companyId}`),
        fetch(`/api/companies`),
      ]);

      const schedJson = await schedRes.json();
      const compJson = await compRes.json();

      if (!schedRes.ok) throw new Error(schedJson.error);

      setSlots(schedJson.data?.slots || []);
      setPostTypes(schedJson.data?.postTypes || []);

      const company = (compJson.data || []).find(
        (c: { id: string; name: string }) => c.id === companyId
      );
      setCompanyName(company?.name || "Company");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group slots by day
  const slotsByDay: Record<number, PostingSlotWithType[]> = {};
  for (let d = 0; d < 7; d++) slotsByDay[d] = [];
  for (const slot of slots) {
    if (slot.is_active) {
      slotsByDay[slot.day_of_week]?.push(slot);
    }
  }
  // Sort each day by scheduled_time
  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  }

  // Separate social vs non-social post types
  const socialPostTypes = postTypes.filter((pt) => pt.content_type === "social_post");
  const longFormPostTypes = postTypes.filter((pt) => pt.content_type !== "social_post");

  // Handle add slot to a specific day
  function startAddSlot(dayOfWeek: number) {
    setAddingToDay(dayOfWeek);
    setEditingSlot(null);
  }

  function selectPostTypeForDay(postType: PostType) {
    if (addingToDay === null) return;
    const defaultTime = addingToDay === 6 ? DEFAULT_TIMES.weekend : DEFAULT_TIMES.morning;
    setEditingSlot({
      id: null,
      postTypeId: postType.id,
      dayOfWeek: addingToDay,
      scheduledTime: defaultTime,
      slotLabel: `${DAY_SHORT[addingToDay]} ${defaultTime < "12:00" ? "AM" : "PM"}`,
      imageArchetype: postType.default_image_archetype || "",
      ctaUrl: "",
      ctaLinkText: "",
    });
    setAddingToDay(null);
  }

  function editSlot(slot: PostingSlotWithType) {
    setEditingSlot({
      id: slot.id,
      postTypeId: slot.post_type_id,
      dayOfWeek: slot.day_of_week,
      scheduledTime: slot.scheduled_time,
      slotLabel: slot.slot_label || "",
      imageArchetype: slot.image_archetype || "",
      ctaUrl: slot.cta_url || "",
      ctaLinkText: slot.cta_link_text || "",
    });
    setAddingToDay(null);
  }

  async function saveSlot() {
    if (!editingSlot) return;
    setSaving(true);
    setError(null);
    try {
      if (editingSlot.id) {
        // Update existing
        const res = await fetch("/api/config/posting-schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSlot.id,
            postTypeId: editingSlot.postTypeId,
            dayOfWeek: editingSlot.dayOfWeek,
            scheduledTime: editingSlot.scheduledTime,
            slotLabel: editingSlot.slotLabel || null,
            imageArchetype: editingSlot.imageArchetype || null,
            ctaUrl: editingSlot.ctaUrl || null,
            ctaLinkText: editingSlot.ctaLinkText || null,
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error);
        }
      } else {
        // Create new
        const res = await fetch("/api/config/posting-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            postTypeId: editingSlot.postTypeId,
            dayOfWeek: editingSlot.dayOfWeek,
            scheduledTime: editingSlot.scheduledTime,
            slotLabel: editingSlot.slotLabel || null,
            imageArchetype: editingSlot.imageArchetype || null,
            ctaUrl: editingSlot.ctaUrl || null,
            ctaLinkText: editingSlot.ctaLinkText || null,
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error);
        }
      }

      setEditingSlot(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save slot");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSlot(slotId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/config/posting-schedule?id=${slotId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      setEditingSlot(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete slot");
    } finally {
      setSaving(false);
    }
  }

  function getPostType(id: string): PostType | undefined {
    return postTypes.find((pt) => pt.id === id);
  }

  function formatTime(time: string): string {
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? "pm" : "am";
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:${m}${suffix}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/companies/${companyId}`}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              &larr; {companyName}
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Posting Schedule</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure the weekly posting schedule. Each slot defines a post type, time, and image archetype.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">
            {slots.filter((s) => s.is_active && s.post_types?.content_type === "social_post").length} social posts
          </p>
          <p className="text-xs text-gray-500">
            {slots.filter((s) => s.is_active && s.post_types?.content_type !== "social_post").length} long-form
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Weekly Calendar Grid */}
      <div className="grid grid-cols-7 gap-3">
        {DAY_NAMES.map((dayName, dayIndex) => {
          const daySlots = slotsByDay[dayIndex] || [];
          return (
            <div key={dayIndex} className="rounded-lg border border-gray-200 bg-white">
              {/* Day header */}
              <div className="border-b border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900">{dayName}</span>
                  <span className="text-[10px] text-gray-400">{daySlots.length}</span>
                </div>
              </div>

              {/* Slots */}
              <div className="space-y-2 p-2">
                {daySlots.map((slot) => {
                  const pt = slot.post_types;
                  const archColor = slot.image_archetype
                    ? ARCHETYPE_COLORS[slot.image_archetype] || "bg-gray-100 text-gray-700 border-gray-200"
                    : "bg-gray-50 text-gray-600 border-gray-150";
                  const isEditing = editingSlot?.id === slot.id;

                  return (
                    <button
                      key={slot.id}
                      onClick={() => editSlot(slot)}
                      className={`w-full rounded-md border p-2 text-left transition-all hover:shadow-sm ${
                        isEditing
                          ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                          : `${archColor}`
                      }`}
                    >
                      <p className="text-xs font-medium leading-tight">
                        {pt?.label || "Unknown"}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">
                          {formatTime(slot.scheduled_time)}
                        </span>
                        {slot.image_archetype && (
                          <span className="text-[10px] text-gray-400">
                            {slot.image_archetype.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      {pt?.word_count_min && pt?.word_count_max && (
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {pt.word_count_min}-{pt.word_count_max} words
                        </p>
                      )}
                    </button>
                  );
                })}

                {/* Add slot button */}
                <button
                  onClick={() => startAddSlot(dayIndex)}
                  className={`w-full rounded-md border border-dashed p-2 text-center text-xs transition-colors ${
                    addingToDay === dayIndex
                      ? "border-sky-400 bg-sky-50 text-sky-700"
                      : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                  }`}
                >
                  + Add
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Post Type Picker (shown when adding to a day) */}
      {addingToDay !== null && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Add post type to {DAY_NAMES[addingToDay]}
            </h2>
            <button
              onClick={() => setAddingToDay(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>

          {/* Social Post Types */}
          <p className="mb-2 text-xs font-medium text-gray-500">Social Posts</p>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {socialPostTypes.map((pt) => (
              <button
                key={pt.id}
                onClick={() => selectPostTypeForDay(pt)}
                className="rounded-md border border-gray-200 bg-white p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
              >
                <p className="text-xs font-medium text-gray-900">{pt.label}</p>
                <div className="mt-1 flex items-center gap-2">
                  {pt.word_count_min && pt.word_count_max && (
                    <span className="text-[10px] text-gray-400">
                      {pt.word_count_min}-{pt.word_count_max}w
                    </span>
                  )}
                  {pt.default_image_archetype && (
                    <span className="text-[10px] text-gray-400">
                      {pt.default_image_archetype.replace("_", " ")}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Long-Form Post Types */}
          <p className="mb-2 text-xs font-medium text-gray-500">Long-Form</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {longFormPostTypes.map((pt) => (
              <button
                key={pt.id}
                onClick={() => selectPostTypeForDay(pt)}
                className="rounded-md border border-gray-200 bg-white p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
              >
                <p className="text-xs font-medium text-gray-900">{pt.label}</p>
                <span className="text-[10px] text-gray-400">
                  {pt.content_type.replace("_", " ")}
                  {pt.word_count_min && pt.word_count_max
                    ? ` · ${pt.word_count_min}-${pt.word_count_max}w`
                    : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slot Editor (shown when editing or creating a slot) */}
      {editingSlot && (
        <div className="rounded-lg border border-sky-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {editingSlot.id ? "Edit Slot" : "New Slot"} &mdash;{" "}
              {getPostType(editingSlot.postTypeId)?.label || "Unknown"}
            </h2>
            <div className="flex items-center gap-2">
              {editingSlot.id && (
                <button
                  onClick={() => deleteSlot(editingSlot.id!)}
                  disabled={saving}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setEditingSlot(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Day of Week */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Day</label>
              <select
                value={editingSlot.dayOfWeek}
                onChange={(e) =>
                  setEditingSlot({ ...editingSlot, dayOfWeek: parseInt(e.target.value, 10) })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scheduled Time */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Time</label>
              <input
                type="time"
                value={editingSlot.scheduledTime.substring(0, 5)}
                onChange={(e) =>
                  setEditingSlot({ ...editingSlot, scheduledTime: e.target.value + ":00" })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              />
            </div>

            {/* Slot Label */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Label</label>
              <input
                type="text"
                value={editingSlot.slotLabel}
                onChange={(e) => setEditingSlot({ ...editingSlot, slotLabel: e.target.value })}
                placeholder="e.g. Monday AM"
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              />
            </div>

            {/* Image Archetype */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Image Archetype</label>
              <select
                value={editingSlot.imageArchetype}
                onChange={(e) =>
                  setEditingSlot({ ...editingSlot, imageArchetype: e.target.value })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              >
                <option value="">None (link preview)</option>
                <option value="A1_green">A1 Quote Card (Green)</option>
                <option value="A1_purple">A1 Quote Card (Purple)</option>
                <option value="A1_blue">A1 Quote Card (Blue)</option>
                <option value="A2_editorial">A2 Healthcare Editorial</option>
                <option value="A3B_real_photo">A3B Real Photo (Manual)</option>
                <option value="A4_pixar">A4 Cinematic 3D Style</option>
                <option value="A5_carousel">A5 Carousel</option>
                <option value="A7_infographic">A7 Infographic</option>
              </select>
            </div>

            {/* CTA URL */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">CTA URL</label>
              <input
                type="url"
                value={editingSlot.ctaUrl}
                onChange={(e) => setEditingSlot({ ...editingSlot, ctaUrl: e.target.value })}
                placeholder="https://..."
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              />
            </div>

            {/* CTA Link Text */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">CTA Link Text</label>
              <input
                type="text"
                value={editingSlot.ctaLinkText}
                onChange={(e) => setEditingSlot({ ...editingSlot, ctaLinkText: e.target.value })}
                placeholder="e.g. Read the blog"
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
              />
            </div>
          </div>

          {/* Post type template preview */}
          {getPostType(editingSlot.postTypeId)?.template_instructions && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
                View template instructions
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-600 whitespace-pre-wrap">
                {getPostType(editingSlot.postTypeId)?.template_instructions}
              </pre>
            </details>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={saveSlot}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingSlot.id ? "Update Slot" : "Add Slot"}
            </button>
          </div>
        </div>
      )}

      {/* Long-form content section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Long-Form Content</h2>
        <p className="mb-4 text-xs text-gray-500">
          Blog articles, LinkedIn articles, and other long-form content produced alongside the weekly social posts.
        </p>
        <div className="space-y-2">
          {slots
            .filter((s) => s.is_active && s.post_types?.content_type !== "social_post")
            .map((slot) => (
              <button
                key={slot.id}
                onClick={() => editSlot(slot)}
                className="flex w-full items-center justify-between rounded-md border border-gray-200 px-4 py-2.5 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {slot.post_types?.label || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {DAY_NAMES[slot.day_of_week]} {formatTime(slot.scheduled_time)}
                    {slot.post_types?.word_count_min && slot.post_types?.word_count_max
                      ? ` · ${slot.post_types.word_count_min}-${slot.post_types.word_count_max} words`
                      : ""}
                  </p>
                </div>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {slot.post_types?.content_type?.replace("_", " ")}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
