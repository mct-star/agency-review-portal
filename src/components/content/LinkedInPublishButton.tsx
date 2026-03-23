"use client";

import { useState } from "react";

interface LinkedInPublishButtonProps {
  pieceId: string;
  companyId: string;
  isApproved: boolean;
}

type PublishState = "idle" | "confirming" | "publishing" | "success" | "error";

/**
 * Button to publish a content piece directly to LinkedIn.
 * Includes a confirmation step and dry-run preview.
 */
export default function LinkedInPublishButton({
  pieceId,
  companyId,
  isApproved,
}: LinkedInPublishButtonProps) {
  const [state, setState] = useState<PublishState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; urn: string } | null>(null);
  const [dryRunData, setDryRunData] = useState<Record<string, unknown> | null>(null);

  if (!isApproved) return null;

  const handleDryRun = async () => {
    setState("confirming");
    setError(null);

    try {
      const res = await fetch("/api/publish/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, companyId, dryRun: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to preview");
      }

      setDryRunData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setState("error");
    }
  };

  const handlePublish = async () => {
    setState("publishing");
    setError(null);

    try {
      const res = await fetch("/api/publish/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, companyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Publishing failed");
      }

      setResult({ url: data.post.url, urn: data.post.urn });
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publishing failed");
      setState("error");
    }
  };

  const handleCancel = () => {
    setState("idle");
    setDryRunData(null);
    setError(null);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Idle state — show publish button */}
      {state === "idle" && (
        <button
          onClick={handleDryRun}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
          </svg>
          Publish to LinkedIn
        </button>
      )}

      {/* Confirmation state — show preview + confirm */}
      {state === "confirming" && dryRunData && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-gray-900">Confirm LinkedIn Publish</span>
          </div>

          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600 space-y-1">
            <p>
              <strong>Account:</strong>{" "}
              {(dryRunData.linkedInAccount as Record<string, string>)?.name || "Unknown"}
            </p>
            <p>
              <strong>Text length:</strong>{" "}
              {dryRunData.postTextLength as number} characters
            </p>
            <p>
              <strong>Image:</strong>{" "}
              {dryRunData.hasImage ? "Yes" : "No"}
            </p>
            <p>
              <strong>First comment:</strong>{" "}
              {dryRunData.hasFirstComment ? "Yes" : "No"}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePublish}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Confirm Publish
            </button>
            <button
              onClick={handleCancel}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Publishing state */}
      {state === "publishing" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            <span className="text-sm text-gray-600">Publishing to LinkedIn...</span>
          </div>
          <p className="text-xs text-gray-400 ml-8">This can take up to 15 seconds while we upload your image and create the post.</p>
        </div>
      )}

      {/* Success state */}
      {state === "success" && result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
              <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-medium text-green-700">Published to LinkedIn</span>
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View post on LinkedIn
          </a>
        </div>
      )}

      {/* Error state */}
      {state === "error" && (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={handleCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
