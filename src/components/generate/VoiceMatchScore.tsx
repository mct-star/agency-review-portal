"use client";

import { useState, useEffect, useRef } from "react";

interface VoiceMatchScoreProps {
  companyId: string;
  postText: string;
}

/**
 * VoiceMatchScore - Circular gauge showing how well a generated post
 * matches the company's voice profile. Auto-fetches on mount.
 */
export default function VoiceMatchScore({ companyId, postText }: VoiceMatchScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Prevent double-fetch in strict mode
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchScore() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/generate/voice-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, postText }),
        });
        if (!res.ok) {
          throw new Error("Voice scoring failed");
        }
        const data = await res.json();
        setScore(data.score ?? null);
        setFeedback(data.feedback || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to score voice");
      } finally {
        setLoading(false);
      }
    }

    fetchScore();
  }, [companyId, postText]);

  // Colour based on score
  const getColor = (s: number) => {
    if (s >= 80) return { stroke: "#22c55e", text: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "Strong match" };
    if (s >= 60) return { stroke: "#f59e0b", text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: "Moderate match" };
    return { stroke: "#ef4444", text: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Weak match" };
  };

  // SVG circular gauge
  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? (score / 100) * circumference : 0;

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="relative h-12 w-12 flex-shrink-0">
          <div className="absolute inset-0 animate-pulse rounded-full border-4 border-gray-200" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Analysing voice...</p>
          <p className="text-[10px] text-gray-500">Comparing against your voice profile</p>
        </div>
      </div>
    );
  }

  if (error || score === null) {
    return null;
  }

  const colors = getColor(score);

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} px-4 py-3`}>
      <div className="flex items-start gap-3">
        {/* Circular gauge */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors.stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xs font-bold ${colors.text}`}>{score}</span>
          </div>
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-gray-700">Voice Match</h4>
            <span className={`text-[10px] font-medium ${colors.text}`}>{colors.label}</span>
          </div>
          {feedback.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {feedback.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600 leading-tight">
                  <span className="mt-0.5 flex-shrink-0 text-[8px]">{"\u2022"}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
