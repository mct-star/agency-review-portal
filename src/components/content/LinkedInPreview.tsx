"use client";

import { useState } from "react";

interface LinkedInPreviewProps {
  authorName: string;
  authorTagline?: string;
  authorAvatarUrl?: string;
  postText: string;
  firstComment: string | null;
  imageUrl?: string | null;
  postType?: string | null;
  brandColor?: string;
}

/**
 * LinkedIn Post Mock-up
 *
 * Renders a content piece as it would appear in the LinkedIn feed.
 * Pure CSS — no LinkedIn connection needed. Shows:
 * - Profile section (avatar, name, tagline, "1st" badge)
 * - Post text with "...see more" truncation at the right point
 * - Optional image placeholder
 * - Reaction bar (Like, Comment, Repost, Send)
 * - First comment as a reply below
 */
export default function LinkedInPreview({
  authorName,
  authorTagline = "Healthcare Demand Generation",
  authorAvatarUrl,
  postText,
  firstComment,
  imageUrl,
  postType,
  brandColor = "#0a66c2",
}: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  // LinkedIn truncates at roughly 210 characters (3 lines) before "...see more"
  const TRUNCATE_LENGTH = 210;
  const shouldTruncate = postText.length > TRUNCATE_LENGTH;
  const displayText = expanded || !shouldTruncate
    ? postText
    : postText.substring(0, TRUNCATE_LENGTH);

  // Get initials for avatar fallback
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Format text: convert markdown-style formatting to LinkedIn-style display
  function formatLinkedInText(text: string): string {
    return text
      // Remove markdown bold markers (LinkedIn doesn't support markdown)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      // Remove markdown italic markers
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      // Remove heading markers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove link markdown, keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Clean up multiple blank lines
      .replace(/\n{3,}/g, "\n\n");
  }

  const formattedText = formatLinkedInText(displayText);

  return (
    <div className="mx-auto max-w-[555px]">
      {/* Post card */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {/* Author section */}
        <div className="flex items-start gap-3 p-4 pb-0">
          {/* Avatar */}
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            {authorAvatarUrl ? (
              <img
                src={authorAvatarUrl}
                alt={authorName}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          {/* Name + tagline */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900">{authorName}</span>
              <span className="rounded-sm border border-gray-300 px-1 text-[10px] font-medium text-gray-500">
                1st
              </span>
            </div>
            <p className="text-xs text-gray-500 line-clamp-1">{authorTagline}</p>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <span>Just now</span>
              <span>·</span>
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
                <path d="M7.5 3a.5.5 0 0 1 .5.5V8h3a.5.5 0 0 1 0 1H7.5a.5.5 0 0 1-.5-.5V3.5a.5.5 0 0 1 .5-.5z" />
              </svg>
            </div>
          </div>

          {/* More icon */}
          <button className="mt-1 text-gray-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>

        {/* Post type badge (development helper) */}
        {postType && (
          <div className="px-4 pt-2">
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
              {postType}
            </span>
          </div>
        )}

        {/* Post text */}
        <div className="px-4 pt-3 pb-1">
          <div className="text-sm leading-[1.42] text-gray-900 whitespace-pre-wrap">
            {formattedText}
            {shouldTruncate && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="text-gray-500 hover:text-gray-700"
              >
                ...see more
              </button>
            )}
          </div>
          {expanded && shouldTruncate && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-1 text-xs text-gray-500 hover:text-gray-700"
            >
              show less
            </button>
          )}
        </div>

        {/* Hashtags (extracted from end of text) */}
        {postText.match(/#\w+/g) && (
          <div className="px-4 pb-2">
            <p className="text-sm text-blue-600">
              {postText.match(/#\w+/g)?.join(" ")}
            </p>
          </div>
        )}

        {/* Image placeholder */}
        {imageUrl ? (
          <div className="mt-2">
            <img
              src={imageUrl}
              alt="Post image"
              className="w-full object-cover"
              style={{ maxHeight: "400px" }}
            />
          </div>
        ) : (
          <div className="mx-4 mt-2 mb-2 flex h-48 items-center justify-center rounded-md border-2 border-dashed border-gray-200 bg-gray-50">
            <div className="text-center">
              <svg className="mx-auto h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
              <p className="mt-1 text-xs text-gray-400">Image will be generated</p>
            </div>
          </div>
        )}

        {/* Reaction counts */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <div className="flex items-center gap-0.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[8px] text-white">
              👍
            </span>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-400 text-[8px] text-white">
              ❤️
            </span>
            <span className="ml-1 text-xs text-gray-500">Preview</span>
          </div>
          <span className="text-xs text-gray-500">
            {firstComment ? "1 comment" : "0 comments"}
          </span>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-around px-2 py-1">
          {[
            { icon: "M2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10S2 17.5 2 12zm10 6c3.3 0 6-2.7 6-6h-2c0 2.2-1.8 4-4 4s-4-1.8-4-4H6c0 3.3 2.7 6 6 6zm-2-8c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm4 0c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z", label: "Like" },
            { icon: "M7 9h10v1H7V9zm0 3h7v1H7v-1zm0-6h10v1H7V6zM3 5v14l4-4h12V5H3z", label: "Comment" },
            { icon: "M18 16v2H6v-2l-4 4h20l-4-4zM12 2L8 6h3v7h2V6h3l-4-4z", label: "Repost" },
            { icon: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z", label: "Send" },
          ].map((action) => (
            <button
              key={action.label}
              className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d={action.icon} />
              </svg>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* First Comment */}
      {firstComment && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: brandColor }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-900">{authorName}</span>
                  <span className="text-[10px] text-gray-400">Author</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {firstComment}
                </p>
              </div>
              <div className="mt-1 flex items-center gap-3 px-1 text-[10px] text-gray-400">
                <span>Just now</span>
                <button className="font-semibold hover:text-gray-600">Like</button>
                <button className="font-semibold hover:text-gray-600">Reply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
