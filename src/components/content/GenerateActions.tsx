"use client";

import { useState, useMemo } from "react";
import type { DistributionPlatform, AdaptationType, ContentType } from "@/types/database";
import {
  getPlatformsByCategory,
  type PlatformCapability,
} from "@/lib/platform-registry";

interface GenerateActionsProps {
  pieceId: string;
  companyId: string;
  contentType: string;
  isAdmin: boolean;
}

interface PlatformSelection {
  platform: DistributionPlatform;
  adaptationType: AdaptationType;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

export default function GenerateActions({
  pieceId,
  companyId,
  contentType,
  isAdmin,
}: GenerateActionsProps) {
  // Image generation state
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("natural");
  const [imageAspect, setImageAspect] = useState("1:1");
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Platform adaptation state
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformSelection[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [variantResult, setVariantResult] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);

  // Dynamic platform list based on content type
  const platformGroups = useMemo(
    () => getPlatformsByCategory(contentType as ContentType),
    [contentType]
  );

  // Video rendering state
  const [videoAspect, setVideoAspect] = useState("16:9");
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Transcription state
  const [transcribeUrl, setTranscribeUrl] = useState("");
  const [transcribeLang, setTranscribeLang] = useState("en");
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeResult, setTranscribeResult] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Form visibility
  const [showImageForm, setShowImageForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [showTranscribeForm, setShowTranscribeForm] = useState(false);

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
          platforms: selectedPlatforms.map((s) => ({
            platform: s.platform,
            adaptationType: s.adaptationType,
          })),
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

  async function handleRenderVideo() {
    setRenderingVideo(true);
    setVideoError(null);
    setVideoResult(null);

    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          contentPieceId: pieceId,
          aspectRatio: videoAspect,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video rendering failed");

      setVideoResult(
        `Video rendered successfully (${data.durationSeconds ?? "?"}s). Refresh the page to see assets.`
      );
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Failed to render video");
    } finally {
      setRenderingVideo(false);
    }
  }

  async function handleTranscribe() {
    if (!transcribeUrl.trim()) return;
    setTranscribing(true);
    setTranscribeError(null);
    setTranscribeResult(null);

    try {
      const res = await fetch("/api/generate/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          contentPieceId: pieceId,
          mediaUrl: transcribeUrl,
          language: transcribeLang,
          includeTimestamps,
          diarize,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");

      setTranscribeResult(
        `Transcribed ${data.wordCount ?? "?"} words, ${data.segmentCount ?? 0} segments. Refresh the page to see the transcript.`
      );
      setTranscribeUrl("");
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : "Failed to transcribe");
    } finally {
      setTranscribing(false);
    }
  }

  function togglePlatform(cap: PlatformCapability) {
    setSelectedPlatforms((prev) => {
      const existing = prev.find((s) => s.platform === cap.platform);
      if (existing) {
        return prev.filter((s) => s.platform !== cap.platform);
      }
      return [...prev, { platform: cap.platform, adaptationType: cap.defaultAdaptationType }];
    });
  }

  function cycleAdaptationType(platform: DistributionPlatform, cap: PlatformCapability) {
    setSelectedPlatforms((prev) =>
      prev.map((s) => {
        if (s.platform !== platform) return s;
        const allTypes = [cap.defaultAdaptationType, ...cap.alternativeAdaptations];
        const currentIdx = allTypes.indexOf(s.adaptationType);
        const nextIdx = (currentIdx + 1) % allTypes.length;
        return { ...s, adaptationType: allTypes[nextIdx] };
      })
    );
  }

  function hideAllForms() {
    setShowImageForm(false);
    setShowVariantForm(false);
    setShowVideoForm(false);
    setShowTranscribeForm(false);
  }

  const hasPlatforms =
    platformGroups.social.length > 0 ||
    platformGroups.content.length > 0 ||
    platformGroups.video.length > 0;
  const showVideo = contentType === "video_script";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        Generate Assets
      </h3>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            const next = !showImageForm;
            hideAllForms();
            setShowImageForm(next);
          }}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {showImageForm ? "Hide" : "Generate Images"}
        </button>
        {hasPlatforms && (
          <button
            onClick={() => {
              const next = !showVariantForm;
              hideAllForms();
              setShowVariantForm(next);
            }}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {showVariantForm ? "Hide" : "Adapt for Platforms"}
          </button>
        )}
        {showVideo && (
          <button
            onClick={() => {
              const next = !showVideoForm;
              hideAllForms();
              setShowVideoForm(next);
            }}
            className="rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
          >
            {showVideoForm ? "Hide" : "Render Video"}
          </button>
        )}
        <button
          onClick={() => {
            const next = !showTranscribeForm;
            hideAllForms();
            setShowTranscribeForm(next);
          }}
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
        >
          {showTranscribeForm ? "Hide" : "Transcribe"}
        </button>
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
        <div className="mt-4 space-y-4 rounded-md border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Select platforms and adaptation types. Click a selected platform to
            cycle through its available adaptations.
          </p>

          {/* Social Platforms */}
          {platformGroups.social.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Social
              </p>
              <div className="flex flex-wrap gap-2">
                {platformGroups.social.map((cap) => {
                  const sel = selectedPlatforms.find(
                    (s) => s.platform === cap.platform
                  );
                  return (
                    <button
                      key={cap.platform}
                      onClick={() =>
                        sel
                          ? cap.alternativeAdaptations.length > 0
                            ? cycleAdaptationType(cap.platform, cap)
                            : togglePlatform(cap)
                          : togglePlatform(cap)
                      }
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (sel) togglePlatform(cap);
                      }}
                      title={
                        sel
                          ? `${cap.label} (${sel.adaptationType}) — click to cycle, right-click to deselect`
                          : cap.label
                      }
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        sel
                          ? `${cap.color} ring-1 ring-current`
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cap.shortLabel}
                      {sel && cap.alternativeAdaptations.length > 0 && (
                        <span className="ml-1 text-[10px] opacity-75">
                          {sel.adaptationType === "copy_adapt"
                            ? "post"
                            : sel.adaptationType === "thread_expand"
                              ? "thread"
                              : sel.adaptationType === "link_post"
                                ? "link"
                                : sel.adaptationType === "promo_post"
                                  ? "promo"
                                  : sel.adaptationType === "caption_generate"
                                    ? "caption"
                                    : sel.adaptationType}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Content Platforms */}
          {platformGroups.content.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Content / Newsletter
              </p>
              <div className="flex flex-wrap gap-2">
                {platformGroups.content.map((cap) => {
                  const sel = selectedPlatforms.find(
                    (s) => s.platform === cap.platform
                  );
                  return (
                    <button
                      key={cap.platform}
                      onClick={() => togglePlatform(cap)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        sel
                          ? `${cap.color} ring-1 ring-current`
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cap.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Video Platforms */}
          {platformGroups.video.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Video
              </p>
              <div className="flex flex-wrap gap-2">
                {platformGroups.video.map((cap) => {
                  const sel = selectedPlatforms.find(
                    (s) => s.platform === cap.platform
                  );
                  return (
                    <button
                      key={cap.platform}
                      onClick={() => togglePlatform(cap)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        sel
                          ? `${cap.color} ring-1 ring-current`
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cap.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

      {/* Video Rendering Form */}
      {showVideoForm && (
        <div className="mt-4 space-y-3 rounded-md border border-purple-100 bg-purple-50 p-4">
          <p className="text-xs text-gray-600">
            Render a video from this script. The system will extract the script
            text, intro/outro specs, and B-roll timestamps from the content
            assets, then send them to the video provider.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Aspect Ratio
            </label>
            <select
              value={videoAspect}
              onChange={(e) => setVideoAspect(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            >
              <option value="16:9">16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait / Reels)</option>
              <option value="1:1">1:1 (Square)</option>
              <option value="4:3">4:3 (Standard)</option>
            </select>
          </div>
          <button
            onClick={handleRenderVideo}
            disabled={renderingVideo}
            className="rounded-md bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {renderingVideo ? "Rendering..." : "Render Video"}
          </button>
          {videoResult && (
            <p className="text-xs text-green-600">{videoResult}</p>
          )}
          {videoError && (
            <p className="text-xs text-red-600">{videoError}</p>
          )}
        </div>
      )}

      {/* Transcription Form */}
      {showTranscribeForm && (
        <div className="mt-4 space-y-3 rounded-md border border-amber-100 bg-amber-50 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Audio/Video URL
            </label>
            <input
              type="url"
              value={transcribeUrl}
              onChange={(e) => setTranscribeUrl(e.target.value)}
              placeholder="https://example.com/recording.mp3"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-300"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Language
              </label>
              <select
                value={transcribeLang}
                onChange={(e) => setTranscribeLang(e.target.value)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={(e) => setIncludeTimestamps(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Timestamps
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={diarize}
                  onChange={(e) => setDiarize(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Speaker ID
              </label>
            </div>
          </div>
          <button
            onClick={handleTranscribe}
            disabled={transcribing || !transcribeUrl.trim()}
            className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {transcribing ? "Transcribing..." : "Transcribe"}
          </button>
          {transcribeResult && (
            <p className="text-xs text-green-600">{transcribeResult}</p>
          )}
          {transcribeError && (
            <p className="text-xs text-red-600">{transcribeError}</p>
          )}
        </div>
      )}
    </div>
  );
}
