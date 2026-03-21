"use client";

import { useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import LinkedInPreview from "./LinkedInPreview";

interface ContentViewTabsProps {
  markdownBody: string;
  firstComment: string | null;
  contentType: string;
  // Company/author context for LinkedIn preview
  authorName: string;
  authorTagline?: string;
  brandColor?: string;
  postType?: string | null;
  imageUrl?: string | null;
  // Required for Apply Brand Overlay button
  companyId?: string;
  contentPieceId?: string;
}

type ViewTab = "content" | "preview";

/**
 * Tab switcher that toggles between:
 * - "Content" — raw markdown rendered with ReactMarkdown
 * - "Preview" — LinkedIn post mock-up (for social_post / linkedin_article)
 *
 * Blog articles and other long-form types only show "Content" since
 * a LinkedIn mock-up wouldn't be representative of their final format.
 */
export default function ContentViewTabs({
  markdownBody,
  firstComment,
  contentType,
  authorName,
  authorTagline,
  brandColor,
  postType,
  imageUrl,
  companyId,
  contentPieceId,
}: ContentViewTabsProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("content");
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(imageUrl ?? null);
  const [applyingOverlay, setApplyingOverlay] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  async function handleApplyOverlay() {
    if (!currentImageUrl || !companyId) return;
    setApplyingOverlay(true);
    setOverlayError(null);
    try {
      const res = await fetch("/api/generate/overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: currentImageUrl, companyId, contentPieceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Overlay failed");
      setCurrentImageUrl(json.url);
    } catch (err) {
      setOverlayError(err instanceof Error ? err.message : "Overlay failed");
    } finally {
      setApplyingOverlay(false);
    }
  }

  // Only social posts and LinkedIn articles get a Preview tab
  const showPreviewTab =
    contentType === "social_post" || contentType === "linkedin_article";

  const tabs: { id: ViewTab; label: string }[] = [
    { id: "content", label: "Content" },
    ...(showPreviewTab ? [{ id: "preview" as ViewTab, label: "LinkedIn Preview" }] : []),
  ];

  return (
    <div>
      {/* Tab bar — only rendered if there are multiple tabs */}
      {showPreviewTab && (
        <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content view */}
      {activeTab === "content" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <MarkdownRenderer content={markdownBody} />
        </div>
      )}

      {/* LinkedIn Preview view */}
      {activeTab === "preview" && showPreviewTab && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-gray-500">
                LinkedIn Feed Preview
              </span>
            </div>
            {currentImageUrl && companyId && (
              <button
                onClick={handleApplyOverlay}
                disabled={applyingOverlay}
                className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {applyingOverlay ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Applying…
                  </>
                ) : (
                  <>✦ Apply Brand Overlay</>
                )}
              </button>
            )}
          </div>
          {overlayError && (
            <p className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600">{overlayError}</p>
          )}
          <LinkedInPreview
            authorName={authorName}
            authorTagline={authorTagline}
            postText={markdownBody}
            firstComment={firstComment}
            postType={postType}
            imageUrl={currentImageUrl}
            brandColor={brandColor}
          />
        </div>
      )}

      {/* First Comment — shown below both views in Content mode */}
      {activeTab === "content" && firstComment && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">
            First Comment
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {firstComment}
          </p>
        </div>
      )}
    </div>
  );
}
