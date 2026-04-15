"use client";

import { useState } from "react";

type ComplexityLevel = "beginner" | "intermediate" | "advanced";

interface ComplexitySelectorProps {
  currentLevel: string;
  companyId: string;
  onSave?: () => void;
}

interface LevelConfig {
  level: ComplexityLevel;
  title: string;
  subtitle: string;
  accent: string;
  borderActive: string;
  bgActive: string;
  checkColor: string;
  badgeBg: string;
  badgeText: string;
  included: string[];
  hidden: string[];
}

const LEVELS: LevelConfig[] = [
  {
    level: "beginner",
    title: "Beginner",
    subtitle: "I'm just getting started",
    accent: "text-green-600",
    borderActive: "border-green-400 ring-2 ring-green-200",
    bgActive: "bg-green-50/50",
    checkColor: "text-green-500",
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
    included: [
      "Strategy Interview",
      "Quick Post",
      "Voice Dictation",
      "Basic Review",
    ],
    hidden: [
      "Week Batch",
      "Calendar",
      "Compliance",
      "Publishing",
      "API Keys",
      "Image Mapping",
    ],
  },
  {
    level: "intermediate",
    title: "Intermediate",
    subtitle: "I know what I'm doing",
    accent: "text-blue-600",
    borderActive: "border-blue-400 ring-2 ring-blue-200",
    bgActive: "bg-blue-50/50",
    checkColor: "text-blue-500",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    included: [
      "Strategy Interview",
      "Quick Post",
      "Voice Dictation",
      "Basic Review",
      "Week Batch",
      "Calendar",
      "Compliance",
      "Blog / Article",
    ],
    hidden: [
      "API Keys",
      "Image Mapping",
      "Blueprint Editor",
      "Month Batch",
    ],
  },
  {
    level: "advanced",
    title: "Advanced",
    subtitle: "Show me everything",
    accent: "text-purple-600",
    borderActive: "border-purple-400 ring-2 ring-purple-200",
    bgActive: "bg-purple-50/50",
    checkColor: "text-purple-500",
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-700",
    included: ["All features visible"],
    hidden: [],
  },
];

export default function ComplexitySelector({
  currentLevel,
  companyId,
  onSave,
}: ComplexitySelectorProps) {
  const [selected, setSelected] = useState<ComplexityLevel>(
    (currentLevel as ComplexityLevel) || "advanced"
  );
  const [saving, setSaving] = useState(false);

  async function handleSelect(level: ComplexityLevel) {
    if (level === selected) return;
    setSelected(level);
    setSaving(true);

    try {
      const res = await fetch("/api/config/company/complexity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, complexity: level }),
      });

      if (!res.ok) {
        // Revert on failure
        setSelected((currentLevel as ComplexityLevel) || "advanced");
      } else {
        onSave?.();
      }
    } catch {
      setSelected((currentLevel as ComplexityLevel) || "advanced");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {LEVELS.map((cfg) => {
        const isSelected = selected === cfg.level;

        return (
          <button
            key={cfg.level}
            type="button"
            disabled={saving}
            onClick={() => handleSelect(cfg.level)}
            className={`relative rounded-xl border p-4 text-left transition-all ${
              isSelected
                ? `${cfg.borderActive} ${cfg.bgActive}`
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            } ${saving ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
          >
            {/* Selected checkmark */}
            {isSelected && (
              <div className="absolute top-3 right-3">
                <svg
                  className={`h-5 w-5 ${cfg.checkColor}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            )}

            {/* Title */}
            <div className="flex items-center gap-2">
              <h4 className={`text-sm font-bold ${isSelected ? cfg.accent : "text-gray-900"}`}>
                {cfg.title}
              </h4>
              {isSelected && (
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
                  Active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">{cfg.subtitle}</p>

            {/* Included features */}
            <ul className="mt-3 space-y-1">
              {cfg.included.map((feature) => (
                <li key={feature} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <svg
                    className={`h-3 w-3 shrink-0 ${cfg.checkColor}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Hidden features */}
            {cfg.hidden.length > 0 && (
              <ul className="mt-2 space-y-1">
                {cfg.hidden.map((feature) => (
                  <li key={feature} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <svg
                      className="h-3 w-3 shrink-0 text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </button>
        );
      })}
    </div>
  );
}
