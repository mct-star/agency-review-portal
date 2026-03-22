"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { IMAGE_STYLES } from "@/components/setup/ImageStyleSelector";

/**
 * Image Mapping Page — maps each posting slot (post type + day) to a
 * specific image style and optional configuration (colour, character, etc.).
 */

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface ImageMappingEntry {
  imageStyle: string;
  color?: string;
  characterDescription?: string;
}

interface PostTypeRef {
  id: string;
  slug: string;
  label: string;
}

interface SlotData {
  id: string;
  day_of_week: number;
  slot_label: string | null;
  image_archetype: string | null;
  sort_order: number;
  post_types: PostTypeRef;
}

// Default colour palette for quote cards
const QUOTE_CARD_COLORS = [
  { name: "Green", hex: "#16a34a" },
  { name: "Purple", hex: "#9333ea" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Slate", hex: "#475569" },
  { name: "Amber", hex: "#d97706" },
];

function StylePreview({ style, color }: { style: string; color?: string }) {
  const imageStyle = IMAGE_STYLES.find((s) => s.slug === style);
  if (!imageStyle) {
    return (
      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
        <span className="text-gray-400 text-xs">?</span>
      </div>
    );
  }

  const displayColor = style === "quote_card" && color ? color : imageStyle.previewColor;

  if (style === "real_photo") {
    return (
      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="h-10 w-10 rounded-lg border border-gray-200"
      style={{ backgroundColor: displayColor + "20" }}
    >
      <div
        className="m-1.5 h-7 w-7 rounded"
        style={{ backgroundColor: displayColor }}
      />
    </div>
  );
}

export default function ImageMappingPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [mapping, setMapping] = useState<Record<string, ImageMappingEntry>>({});
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/config/image-mapping?companyId=${companyId}`);
      const data = await res.json();
      setMapping(data.mapping || {});
      setSlots(data.slots || []);
      setLoading(false);
    }
    load();
  }, [companyId]);

  const updateSlotMapping = useCallback(
    (slotId: string, updates: Partial<ImageMappingEntry>) => {
      setMapping((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], imageStyle: prev[slotId]?.imageStyle || "", ...updates },
      }));
    },
    []
  );

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/config/image-mapping", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, mapping }),
    });

    setSaving(false);

    if (res.ok) {
      setMessage({ type: "success", text: "Image mapping saved successfully" });
    } else {
      const data = await res.json();
      setMessage({ type: "error", text: data.error || "Failed to save" });
    }
  }

  if (loading) {
    return <div className="text-center text-sm text-gray-400 py-12">Loading...</div>;
  }

  if (slots.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Image Style Mapping</h2>
          <p className="mt-1 text-sm text-gray-500">
            Map each post type to its preferred image style.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <svg className="mx-auto h-10 w-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-gray-700">No posting slots configured</h3>
          <p className="mt-1 text-xs text-gray-500">
            Set up your posting schedule first, then come back to map image styles.
          </p>
        </div>
      </div>
    );
  }

  // Group slots by day
  const slotsByDay = slots.reduce<Record<number, SlotData[]>>((acc, slot) => {
    const day = slot.day_of_week;
    if (!acc[day]) acc[day] = [];
    acc[day].push(slot);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Image Style Mapping</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose the image style for each post type in your schedule. This determines
          what kind of visuals are generated for each post.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Mapping table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Day
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Post Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Image Style
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Config
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 w-16">
                  Preview
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Object.entries(slotsByDay)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([day, daySlots]) =>
                  daySlots.map((slot, idx) => {
                    const entry = mapping[slot.id] || { imageStyle: slot.image_archetype || "" };
                    const selectedStyle = entry.imageStyle;
                    const isQuoteCard = selectedStyle === "quote_card";
                    const is3D = selectedStyle === "pixar_3d";

                    return (
                      <tr key={slot.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* Day */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {idx === 0 ? (
                            <span className="text-sm font-medium text-gray-900">
                              {DAY_NAMES[Number(day)] || `Day ${day}`}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {DAY_NAMES[Number(day)] || ""}
                            </span>
                          )}
                        </td>

                        {/* Post type */}
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {slot.slot_label || slot.post_types?.label || "—"}
                            </p>
                            {slot.post_types?.slug && (
                              <p className="text-xs text-gray-400">{slot.post_types.slug}</p>
                            )}
                          </div>
                        </td>

                        {/* Style selector */}
                        <td className="px-4 py-3">
                          <select
                            value={selectedStyle}
                            onChange={(e) =>
                              updateSlotMapping(slot.id, { imageStyle: e.target.value })
                            }
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="">Select style...</option>
                            {IMAGE_STYLES.map((style) => (
                              <option key={style.slug} value={style.slug}>
                                {style.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Style-specific config */}
                        <td className="px-4 py-3">
                          {isQuoteCard && (
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {QUOTE_CARD_COLORS.map((c) => (
                                  <button
                                    key={c.hex}
                                    title={c.name}
                                    onClick={() => updateSlotMapping(slot.id, { color: c.hex })}
                                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                                      entry.color === c.hex
                                        ? "border-gray-900 scale-110"
                                        : "border-transparent"
                                    }`}
                                    style={{ backgroundColor: c.hex }}
                                  />
                                ))}
                              </div>
                              {/* Custom colour input */}
                              <input
                                type="color"
                                value={entry.color || "#16a34a"}
                                onChange={(e) =>
                                  updateSlotMapping(slot.id, { color: e.target.value })
                                }
                                className="h-6 w-6 cursor-pointer rounded border border-gray-200"
                                title="Custom colour"
                              />
                            </div>
                          )}
                          {is3D && (
                            <input
                              type="text"
                              placeholder="Character description..."
                              value={entry.characterDescription || ""}
                              onChange={(e) =>
                                updateSlotMapping(slot.id, {
                                  characterDescription: e.target.value,
                                })
                              }
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                            />
                          )}
                          {!isQuoteCard && !is3D && selectedStyle && (
                            <span className="text-xs text-gray-400">No config needed</span>
                          )}
                          {!selectedStyle && (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>

                        {/* Preview */}
                        <td className="px-4 py-3 text-center">
                          {selectedStyle ? (
                            <div className="flex justify-center">
                              <StylePreview
                                style={selectedStyle}
                                color={entry.color}
                              />
                            </div>
                          ) : (
                            <div className="h-10 w-10 mx-auto rounded-lg border border-dashed border-gray-200 flex items-center justify-center">
                              <span className="text-gray-300 text-xs">-</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Style legend */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Available Styles
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {IMAGE_STYLES.map((style) => (
            <div key={style.slug} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div
                className="h-6 w-6 shrink-0 rounded"
                style={{ backgroundColor: style.previewColor }}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{style.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{style.category}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <p className="text-xs text-gray-400">
          {Object.keys(mapping).length} of {slots.length} slots configured
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Mapping"}
        </button>
      </div>
    </div>
  );
}
