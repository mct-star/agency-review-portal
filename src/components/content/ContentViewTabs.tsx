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
}: ContentViewTabsProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("content");

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
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs font-medium text-gray-500">
              LinkedIn Feed Preview
            </span>
          </div>
          <LinkedInPreview
            authorName={authorName}
            authorTagline={authorTagline}
            postText={markdownBody}
            firstComment={firstComment}
            postType={postType}
            imageUrl={imageUrl}
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
