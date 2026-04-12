"use client";

import { useMemo } from "react";

interface EngagementPredictorProps {
  postText: string;
  postType: string;
  hasImage: boolean;
}

interface Factor {
  label: string;
  score: number;
  max: number;
}

/**
 * EngagementPredictor - Pure client-side heuristic scoring.
 * Analyses post structure, length, hook strength, and type to
 * predict a relative engagement multiplier. No API call needed.
 */
export default function EngagementPredictor({ postText, postType, hasImage }: EngagementPredictorProps) {
  const { multiplier, factors } = useMemo(() => {
    const text = postText.trim();
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const firstLine = lines[0] || "";
    const firstLineWords = firstLine.split(/\s+/).filter(Boolean).length;

    // ── Hook strength (0-25) ──
    let hookScore = 0;
    if (firstLineWords <= 10) hookScore += 20;
    else if (firstLineWords <= 15) hookScore += 12;
    else hookScore += 5;
    if (firstLine.includes("?")) hookScore += 5;
    if (/^\d/.test(firstLine)) hookScore += 5;
    hookScore = Math.min(25, hookScore);

    // ── Post length (0-20) ──
    let lengthScore = 10;
    if (wordCount >= 150 && wordCount <= 300) lengthScore = 20;
    else if ((wordCount >= 100 && wordCount < 150) || (wordCount > 300 && wordCount <= 400)) lengthScore = 15;

    // ── Structure (0-20) ──
    let structureScore = 0;
    // Check for line breaks creating readable chunks
    const nonEmptyLineCount = lines.length;
    if (nonEmptyLineCount >= 4) structureScore += 15;
    else if (nonEmptyLineCount >= 2) structureScore += 10;
    else structureScore += 5;
    // Bold text (LinkedIn uses **text** or similar)
    if (/\*\*[^*]+\*\*/.test(text) || /\b[A-Z]{3,}\b/.test(text)) structureScore += 5;
    structureScore = Math.min(20, structureScore);

    // ── Post type bonus (0-15) ──
    const typeScores: Record<string, number> = {
      contrarian: 15,
      insight: 15,
      if_i_was: 14,
      scene_provocation: 14,
      personal_update: 12,
      founder_friday: 12,
      launch_story: 12,
      tactical: 10,
      blog_teaser: 8,
    };
    const typeScore = typeScores[postType] ?? 10;

    // ── Image bonus (0-10) ──
    const imageScore = hasImage ? 10 : 3;

    // ── Engagement signals (0-10) ──
    let engagementScore = 0;
    // Ends with question
    const lastLine = lines[lines.length - 1] || "";
    if (lastLine.includes("?")) engagementScore += 8;
    // Has call-to-action keywords
    if (/repost|share|follow|comment|subscribe|sign up|link in|check out/i.test(text)) engagementScore += 5;
    // Hashtags (LinkedIn, max 5 is best)
    const hashtags = text.match(/#\w+/g) || [];
    if (hashtags.length > 0 && hashtags.length <= 5) engagementScore += 3;
    engagementScore = Math.min(10, engagementScore);

    const totalScore = hookScore + lengthScore + structureScore + typeScore + imageScore + engagementScore;
    const mult = Math.round((totalScore / 40) * 10) / 10; // e.g. 2.1

    const allFactors: Factor[] = [
      { label: "Hook strength", score: hookScore, max: 25 },
      { label: "Post length", score: lengthScore, max: 20 },
      { label: "Structure", score: structureScore, max: 20 },
      { label: "Post type", score: typeScore, max: 15 },
      { label: "Image bonus", score: imageScore, max: 10 },
      { label: "Engagement signals", score: engagementScore, max: 10 },
    ];

    return { multiplier: mult, factors: allFactors };
  }, [postText, postType, hasImage]);

  // Colour for the multiplier
  const multColor =
    multiplier >= 2.0 ? "text-green-600" : multiplier >= 1.5 ? "text-amber-600" : "text-gray-600";
  const multBg =
    multiplier >= 2.0 ? "bg-green-50 border-green-200" : multiplier >= 1.5 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200";

  return (
    <div className={`rounded-lg border ${multBg} px-4 py-3`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">&#128200;</span>
        <span className="text-xs font-semibold text-gray-700">Predicted:</span>
        <span className={`text-lg font-bold ${multColor}`}>{multiplier}x</span>
        <span className="text-xs text-gray-500">engagement</span>
      </div>

      {/* Factor bars */}
      <div className="space-y-1.5">
        {factors.map((f) => {
          const pct = Math.round((f.score / f.max) * 100);
          const barColor =
            pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-gray-300";
          const filledBlocks = Math.round(pct / 10);

          return (
            <div key={f.label} className="flex items-center gap-2">
              {/* Mini block bar */}
              <div className="flex gap-px flex-shrink-0" style={{ width: 80 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-[1px] ${i < filledBlocks ? barColor : "bg-gray-200"}`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-gray-600 leading-tight">{f.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
