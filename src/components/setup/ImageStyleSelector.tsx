"use client";

import { useState } from "react";

/**
 * Image Style Selector — lets users pick their preferred visual styles
 * for generated content images. Selected styles are stored on the company
 * and used to determine which archetypes are available during generation.
 */

export interface ImageStyle {
  slug: string;
  name: string;
  description: string;
  category: "illustration" | "photography" | "typography" | "data";
  previewColor: string;
  examples: string[];
}

export const IMAGE_STYLES: ImageStyle[] = [
  {
    slug: "pixar_3d",
    name: "3D Animated (Pixar-style)",
    description: "Disney/Pixar-quality 3D characters and scenes. Great for storytelling. Characters can be customised to resemble your spokesperson.",
    category: "illustration",
    previewColor: "#41CDA9",
    examples: ["Experience stories", "Personal reflections", "Scenario illustrations"],
  },
  {
    slug: "editorial_photography",
    name: "Editorial Photography",
    description: "Photorealistic scenes in business or healthcare settings. Documentary quality, authentic feel. No real people generated.",
    category: "photography",
    previewColor: "#6B7280",
    examples: ["Setting establishment", "Operational context", "Environment shots"],
  },
  {
    slug: "lifestyle_photography",
    name: "Lifestyle Photography",
    description: "Warm, natural photography style with soft lighting. Product-in-context and authentic moment shots.",
    category: "photography",
    previewColor: "#F59E0B",
    examples: ["Product showcase", "Behind the scenes", "Workspace shots"],
  },
  {
    slug: "quote_card",
    name: "Bold Quote Cards",
    description: "Flat solid colour background with bold white text. Minimalist and punchy. Power comes from the emptiness.",
    category: "typography",
    previewColor: "#CDD856",
    examples: ["Hot takes", "Problem diagnosis", "Expert opinions"],
  },
  {
    slug: "carousel_framework",
    name: "Framework Carousel",
    description: "Clean white backgrounds with accent colour. Typography-led slides for frameworks, processes, and how-tos.",
    category: "typography",
    previewColor: "#A27BF9",
    examples: ["Step-by-step guides", "Numbered frameworks", "Tactical how-tos"],
  },
  {
    slug: "infographic",
    name: "Infographic / Data Visual",
    description: "Structured data visualisation with clean typography. Great for statistics, comparisons, and process explanations.",
    category: "data",
    previewColor: "#41C9FE",
    examples: ["Statistics", "Process diagrams", "Data comparisons"],
  },
  {
    slug: "real_photo",
    name: "Real Photography (Your Photos)",
    description: "Use your own uploaded photographs. Best for personal/authentic posts. Upload photos in your profile settings.",
    category: "photography",
    previewColor: "#EC4899",
    examples: ["Weekend posts", "Team photos", "Event coverage"],
  },
  {
    slug: "flat_illustration",
    name: "Flat Illustration",
    description: "Clean, modern flat vector illustrations. Professional and approachable. Works well for concept explanation.",
    category: "illustration",
    previewColor: "#8B5CF6",
    examples: ["Concept explainers", "Process illustration", "Abstract ideas"],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  illustration: "Illustration",
  photography: "Photography",
  typography: "Typography & Text",
  data: "Data & Infographics",
};

interface ImageStyleSelectorProps {
  selectedStyles: string[];
  onSave: (styles: string[]) => Promise<void>;
  saving?: boolean;
}

export default function ImageStyleSelector({
  selectedStyles,
  onSave,
  saving = false,
}: ImageStyleSelectorProps) {
  const [selected, setSelected] = useState<string[]>(selectedStyles);

  function toggleStyle(slug: string) {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
  }

  const categories = [...new Set(IMAGE_STYLES.map((s) => s.category))];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Image Style Preferences</h3>
        <p className="mt-1 text-sm text-gray-500">
          Choose the visual styles you want for your generated content.
          Select all that appeal to you — your choices will be used when generating images.
        </p>
      </div>

      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {CATEGORY_LABELS[cat] || cat}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMAGE_STYLES.filter((s) => s.category === cat).map((style) => {
              const isSelected = selected.includes(style.slug);
              return (
                <button
                  key={style.slug}
                  onClick={() => toggleStyle(style.slug)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 h-8 w-8 shrink-0 rounded-lg"
                      style={{ backgroundColor: style.previewColor + "20" }}
                    >
                      <div
                        className="m-1.5 h-5 w-5 rounded"
                        style={{ backgroundColor: style.previewColor }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{style.name}</p>
                        {isSelected && (
                          <span className="shrink-0 text-violet-600">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{style.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {style.examples.map((ex) => (
                          <span
                            key={ex}
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <p className="text-xs text-gray-400">
          {selected.length === 0
            ? "No styles selected — all styles will be available"
            : `${selected.length} style${selected.length !== 1 ? "s" : ""} selected`}
        </p>
        <button
          onClick={() => onSave(selected)}
          disabled={saving}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
