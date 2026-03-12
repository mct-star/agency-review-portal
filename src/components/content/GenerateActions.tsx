"use client";

import { useState } from "react";
import type { SocialPlatform } from "@/types/database";

interface GenerateActionsProps {
  pieceId: string;
  companyId: string;
  contentType: string;
  isAdmin: boolean;
}

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "linkedin_personal", label: "LinkedIn (Personal)" },
  { value: "linkedin_company", label: "LinkedIn (Company)" },
  { value: "twitter", label: "Twitter/X" },
  { value: "bluesky", label: "Bluesky" },
  { value: "threads", label: "Threads" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
];

export default function GenerateActions({
  pieceId,
  companyId,
  contentType,
  isAdmin,
}: GenerateActionsProps) {
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("natural");
  const [imageAspect, setImageAspect] = useState("1:1");
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [variantResult, setVariantResult] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);

  const [showImageForm, setShowImageForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);

  if (!isAdmin) return null;

  async function handleGenerateImages() {
    if (!imagePrompt.trim()) return;
    setGeneratingImages(true);
    setImageError(null);
    setImageResult(null);

    try {
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          contentPieceId: pieceId,
          prompts: [{ prompt: imagePrompt, style: imageStyle, aspectRatio: imageAspect }],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");

      setImageResult(`Generated ${data.imageCount} image(s). Refresh the page to see them.`);
      setImagePrompt("");
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Failed to generate images");
    } finally {
      setGeneratingImages(false);
    }
  }

  async function handleGenerateVariants() {
    if (selectedPlatforms.length === 0) return;
    setGeneratingVariants(true);
    setVariantError(null);
    setVariantResult(null);

    try {
      const res = await fetch("/api/generate/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPieceId: pieceId,
          platforms: selectedPlatforms,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Platform adaptation failed");

      setVariantResult(`Generated ${data.variantCount} variant(s). Refresh the page to see them.`);
      setSelectedPlatforms([]);
    } catch (err) {
      setVariantError(err instanceof Error ? err.message : "Failed to generate variants");
    } finally {
      setGeneratingVariants(false);
    }
  }

  function togglePlatform(platform: SocialPlatform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  const showVariants =
    contentType === "social_post" || contentType === "linkedin_article";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        Generate Assets
      </h3>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setShowImageForm(!showImageForm);
            setShowVariantForm(false);
          }}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {showImageForm ? "Hide" : "Generate Images"}
        </button>
        {showVariants && (
          <button
            onClick={() => {
              setShowVariantForm(!showVariantForm);
              setShowImageForm(false);
            }}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {showVariantForm ? "Hide" : "Adapt for Platforms"}
          </button>
        )}
      </div>

      {/* Image Generation Form */}
      {showImageForm && (
        <div className="mt-4 space-y-3 rounded-md border border-gray-100 bg-gray-50 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Image Prompt
            </label>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
            />
          </div>
          <div className="flex gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Style
              </label>
              <select
                value={imageStyle}
                onChange={(e) => setImageStyle(e.target.value)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="natural">Natural</option>
                <option value="vivid">Vivid</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Aspect Ratio
              </label>
              <select
                value={imageAspect}
                onChange={(e) => setImageAspect(e.target.value)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="1:1">1:1 (Square)</option>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="4:3">4:3 (Standard)</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleGenerateImages}
            disabled={generatingImages || !imagePrompt.trim()}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {generatingImages ? "Generating..." : "Generate Image"}
          </button>
          {imageResult && (
            <p className="text-xs text-green-600">{imageResult}</p>
          )}
          {imageError && (
            <p className="text-xs text-red-600">{imageError}</p>
          )}
        </div>
      )}

      {/* Platform Adaptation Form */}
      {showVariantForm && (
        <div className="mt-4 space-y-3 rounded-md border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Select platforms to generate adapted variants:
          </p>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => togglePlatform(p.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedPlatforms.includes(p.value)
                    ? "bg-sky-100 text-sky-700 ring-1 ring-sky-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerateVariants}
            disabled={generatingVariants || selectedPlatforms.length === 0}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {generatingVariants
              ? "Adapting..."
              : `Adapt for ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? "s" : ""}`}
          </button>
          {variantResult && (
            <p className="text-xs text-green-600">{variantResult}</p>
          )}
          {variantError && (
            <p className="text-xs text-red-600">{variantError}</p>
          )}
        </div>
      )}
    </div>
  );
}
