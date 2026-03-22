"use client";

import { useState } from "react";

/**
 * BulkGenerateButton — Generates content for all posting slots in a week.
 *
 * Processes slots sequentially (not parallel) to avoid rate limits.
 * Shows real-time progress as each post is generated.
 */

interface PostingSlot {
  id: string;
  day_of_week: string;
  time_slot: string;
  post_type: string;
  label?: string;
}

interface BulkGenerateButtonProps {
  companyId: string;
  spokespersonId?: string;
  slots: PostingSlot[];
  brandColor: string;
  weekLabel: string;
}

interface GeneratedPost {
  slotId: string;
  slotLabel: string;
  postText: string;
  firstComment: string | null;
  imageUrl: string | null;
  success: boolean;
  error?: string;
}

export default function BulkGenerateButton({
  companyId,
  spokespersonId,
  slots,
  brandColor,
  weekLabel,
}: BulkGenerateButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSlot, setCurrentSlot] = useState<string>("");
  const [results, setResults] = useState<GeneratedPost[]>([]);
  const [done, setDone] = useState(false);

  const dayNames: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed",
    thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
  };

  async function handleBulkGenerate() {
    setGenerating(true);
    setProgress(0);
    setResults([]);
    setDone(false);

    const generated: GeneratedPost[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotLabel = `${dayNames[slot.day_of_week] || slot.day_of_week} ${slot.time_slot || ""} — ${slot.label || slot.post_type?.replace(/_/g, " ") || "Post"}`;
      setCurrentSlot(slotLabel);
      setProgress(i);

      try {
        const res = await fetch("/api/generate/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            spokespersonId: spokespersonId || undefined,
            topic: slot.label || slot.post_type?.replace(/_/g, " ") || "industry insight",
            postType: slot.post_type || "insight",
            platform: "linkedin",
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          generated.push({
            slotId: slot.id,
            slotLabel,
            postText: "",
            firstComment: null,
            imageUrl: null,
            success: false,
            error: err.error || `Failed (${res.status})`,
          });
        } else {
          const data = await res.json();
          generated.push({
            slotId: slot.id,
            slotLabel,
            postText: data.postText || "",
            firstComment: data.firstComment || null,
            imageUrl: data.imageUrl || null,
            success: true,
          });
        }
      } catch (err) {
        generated.push({
          slotId: slot.id,
          slotLabel,
          postText: "",
          firstComment: null,
          imageUrl: null,
          success: false,
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }

      setResults([...generated]);
    }

    setProgress(slots.length);
    setDone(true);
    setGenerating(false);
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div>
      {!done && !generating && (
        <button
          onClick={handleBulkGenerate}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-md"
          style={{ backgroundColor: brandColor }}
        >
          Generate All Posts for {weekLabel}
        </button>
      )}

      {generating && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">
                Generating {progress + 1} of {slots.length}...
              </p>
              <span className="text-xs text-gray-400">{Math.round(((progress) / slots.length) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(progress / slots.length) * 100}%`, backgroundColor: brandColor }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">{currentSlot}</p>
          </div>
        </div>
      )}

      {done && (
        <div className="space-y-3">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-green-800">
                {successCount} post{successCount !== 1 ? "s" : ""} generated
                {failCount > 0 && `, ${failCount} failed`}
              </p>
            </div>
            <p className="mt-1 text-xs text-green-700">
              Posts are saved as drafts. Review them in the Content tab before publishing.
            </p>
          </div>

          {/* Results summary */}
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                  r.success
                    ? "border-green-100 bg-green-50 text-green-700"
                    : "border-red-100 bg-red-50 text-red-700"
                }`}
              >
                <span className="font-medium">{r.slotLabel}</span>
                <span>{r.success ? "✓ Generated" : `✗ ${r.error}`}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setDone(false); setResults([]); }}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Generate Again
          </button>
        </div>
      )}

      {!done && !generating && (
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Creates content for all {slots.length} slots. You can review and edit each post before publishing.
        </p>
      )}
    </div>
  );
}
