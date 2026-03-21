"use client";

import { useState, useEffect, useCallback } from "react";

interface OverlayPreviewProps {
  companyId: string;
  hasLogo: boolean;
  hasProfilePic: boolean;
  hasName: boolean;
  brandColor: string;
}

/**
 * Live preview of the brand overlay.
 *
 * Calls the preview API to generate a sample overlaid image from the
 * company's uploaded assets (logo, headshot, brand colour). Refreshes
 * automatically when assets change.
 */
export default function OverlayPreview({
  companyId,
  hasLogo,
  hasProfilePic,
  hasName,
  brandColor,
}: OverlayPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate/overlay/preview?companyId=${companyId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Preview failed");
      setPreviewUrl(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Auto-generate preview on mount
  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  // Checklist of overlay ingredients
  const ingredients = [
    { label: "Profile picture", ready: hasProfilePic },
    { label: "Company logo", ready: hasLogo },
    { label: "Spokesperson name", ready: hasName },
    { label: "Brand colour", ready: !!brandColor },
  ];

  const allReady = ingredients.every((i) => i.ready);
  const readyCount = ingredients.filter((i) => i.ready).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Brand Overlay Preview</h3>
            <p className="mt-1 text-xs text-gray-500">
              This overlay is automatically composited onto every AI-generated image.
            </p>
          </div>
          <button
            onClick={generatePreview}
            disabled={loading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating..." : "↻ Refresh"}
          </button>
        </div>

        {/* Ingredient checklist */}
        <div className="mt-4 flex flex-wrap gap-3">
          {ingredients.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                item.ready
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {item.ready ? (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
                </svg>
              )}
              {item.label}
            </div>
          ))}
        </div>

        {!allReady && (
          <p className="mt-3 text-[11px] text-amber-600">
            {readyCount}/4 assets ready — upload the missing items above to complete your overlay
          </p>
        )}
      </div>

      {/* Preview image */}
      <div className="border-t border-gray-100 bg-gray-50 p-4">
        {loading && !previewUrl ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-violet-600" />
              <p className="text-xs text-gray-500">Generating overlay preview...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={generatePreview}
                className="mt-2 text-xs text-violet-600 hover:text-violet-700"
              >
                Try again
              </button>
            </div>
          </div>
        ) : previewUrl ? (
          <div className="relative mx-auto max-w-md">
            <img
              src={previewUrl}
              alt="Brand overlay preview"
              className="w-full rounded-lg shadow-sm"
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-violet-600" />
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Explanation */}
      <div className="border-t border-gray-100 px-5 py-3">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          The overlay adds your brand colour gradient bar, circular headshot, spokesperson name,
          follow CTA, and company logo to every image. You can also upload a custom transparent
          PNG mask to override this auto-generated overlay.
        </p>
      </div>
    </div>
  );
}
