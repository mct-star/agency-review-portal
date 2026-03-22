"use client";

import { useState, useRef } from "react";

/**
 * LinkedInPostMockup - Renders a realistic LinkedIn post preview.
 *
 * Designed to look like an actual LinkedIn feed post, with optional phone
 * frame wrapping and print-friendly rendering.
 */

export interface LinkedInPostMockupProps {
  authorName: string;
  authorTagline: string;
  authorPhotoUrl?: string | null;
  postText: string;
  imageUrl?: string | null;
  firstComment?: string | null;
  hashtags?: string[];
  timeAgo?: string;
  /** Wrap in a phone bezel for presentation/print */
  phoneFrame?: boolean;
  /** Max lines before "...see more" truncation (default 3) */
  maxLines?: number;
}

function AuthorAvatar({
  name,
  photoUrl,
  size = 48,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-blue-700"
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white font-bold"
          style={{ fontSize: size * 0.35 }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

function EngagementBar() {
  return (
    <div className="flex items-center justify-between px-4 py-1.5">
      {/* Reaction counts */}
      <div className="flex items-center gap-1">
        <div className="flex -space-x-0.5">
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-600 text-[10px]">
            <svg viewBox="0 0 16 16" fill="white" className="h-3 w-3">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.669 7.528L8.388 12.16a.5.5 0 01-.776 0L4.331 7.528A2.5 2.5 0 018 4.587a2.5 2.5 0 013.669 2.941z" />
            </svg>
          </span>
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-green-600 text-[10px]">
            <svg viewBox="0 0 16 16" fill="white" className="h-2.5 w-2.5">
              <path d="M2 10h2V6H2v4zm6.252 2.988l4.316-4.316a1 1 0 00-.305-1.627l-.903-.452A1 1 0 0010.5 6H8V3a1 1 0 00-2 0v6.252l2.252 3.736z" />
            </svg>
          </span>
        </div>
        <span className="text-xs text-gray-500 ml-1">24</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>3 comments</span>
        <span>2 reposts</span>
      </div>
    </div>
  );
}

function ActionButtons() {
  const actions = [
    {
      label: "Like",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
        </svg>
      ),
    },
    {
      label: "Comment",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
      ),
    },
    {
      label: "Repost",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      ),
    },
    {
      label: "Send",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-2 py-1">
      {actions.map((action) => (
        <button
          key={action.label}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          disabled
        >
          {action.icon}
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function PostContent({
  text,
  hashtags,
  maxLines,
}: {
  text: string;
  hashtags?: string[];
  maxLines: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  // Rough truncation: split by newlines and limit
  const lines = text.split("\n");
  const shouldTruncate = !expanded && lines.length > maxLines;
  const displayText = shouldTruncate
    ? lines.slice(0, maxLines).join("\n")
    : text;

  return (
    <div className="px-4 py-2">
      <div ref={textRef} className="text-[14px] leading-[1.4] text-gray-900 whitespace-pre-wrap">
        {displayText}
        {shouldTruncate && (
          <span
            className="text-gray-500 cursor-pointer hover:text-blue-600 hover:underline"
            onClick={() => setExpanded(true)}
          >
            ...see more
          </span>
        )}
      </div>
      {hashtags && hashtags.length > 0 && (
        <div className="mt-2 text-[14px] text-blue-600">
          {hashtags.map((h) => (
            <span key={h} className="mr-1">
              #{h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FirstComment({
  authorName,
  authorPhotoUrl,
  text,
}: {
  authorName: string;
  authorPhotoUrl?: string | null;
  text: string;
}) {
  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <div className="flex gap-2">
        <AuthorAvatar name={authorName} photoUrl={authorPhotoUrl} size={32} />
        <div className="flex-1 min-w-0">
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold text-gray-900">{authorName}</p>
            <p className="mt-0.5 text-[13px] leading-[1.35] text-gray-700 whitespace-pre-wrap">
              {text}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
            <span>Like</span>
            <span>Reply</span>
            <span>1m</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInCard({
  authorName,
  authorTagline,
  authorPhotoUrl,
  postText,
  imageUrl,
  firstComment,
  hashtags,
  timeAgo = "1h",
  maxLines = 3,
}: LinkedInPostMockupProps) {
  return (
    <div className="w-full max-w-[555px] mx-auto">
      {/* Preview label */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Post Preview
        </span>
        <span className="text-[10px] text-gray-300">LinkedIn Feed View</span>
      </div>

      {/* The card */}
      <div className="rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
        {/* Header: avatar + author info */}
        <div className="flex items-start gap-2.5 px-4 pt-3 pb-1">
          <AuthorAvatar
            name={authorName}
            photoUrl={authorPhotoUrl}
            size={48}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {authorName}
              </span>
              <span className="text-xs text-gray-400 shrink-0">
                &bull; 1st
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate leading-tight">
              {authorTagline}
            </p>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <span>{timeAgo}</span>
              <span>&bull;</span>
              {/* Globe icon */}
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8c0-.603.08-1.188.232-1.743l2.46 6.028A6.507 6.507 0 011.5 8zm6.5 6.5a6.48 6.48 0 01-2.764-.62L8.1 6.882l2.93 8.028A6.453 6.453 0 018 14.5zm.768-10.04c.578-.032 1.098-.094 1.098-.094.516-.063.455-.82-.063-.79 0 0-1.55.122-2.55.122-.938 0-2.519-.122-2.519-.122-.516-.03-.578.758-.063.79 0 0 .488.063 1.004.094l1.49 4.086-2.094 6.28L2.17 4.46c.578-.032 1.098-.094 1.098-.094.516-.063.455-.82-.063-.79 0 0-1.55.122-2.55.122a8.042 8.042 0 014.78-2.72L8 4.03l.268.43z" />
              </svg>
            </div>
          </div>
          {/* Three-dot menu */}
          <button className="shrink-0 p-1 text-gray-400" disabled>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>

        {/* Post text */}
        <PostContent
          text={postText}
          hashtags={hashtags}
          maxLines={maxLines}
        />

        {/* Image */}
        {imageUrl && (
          <div className="w-full">
            <img
              src={imageUrl}
              alt="Post image"
              className="w-full object-cover"
              style={{ maxHeight: 400 }}
            />
          </div>
        )}

        {/* Engagement counts */}
        <EngagementBar />

        {/* Action buttons */}
        <ActionButtons />

        {/* First comment */}
        {firstComment && (
          <FirstComment
            authorName={authorName}
            authorPhotoUrl={authorPhotoUrl}
            text={firstComment}
          />
        )}
      </div>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center">
      <div className="relative mx-auto">
        {/* Phone bezel */}
        <div className="rounded-[40px] border-[8px] border-gray-800 bg-gray-800 p-1 shadow-2xl">
          {/* Notch */}
          <div className="relative">
            <div className="absolute left-1/2 top-0 z-10 h-6 w-36 -translate-x-1/2 rounded-b-2xl bg-gray-800" />
          </div>
          {/* Screen */}
          <div
            className="overflow-hidden rounded-[32px] bg-[#f3f2ef]"
            style={{ width: 375, maxHeight: 720 }}
          >
            {/* Status bar */}
            <div className="flex items-center justify-between bg-white px-5 py-2">
              <span className="text-xs font-semibold text-gray-900">9:41</span>
              <div className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-gray-900" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
                </svg>
                <svg className="h-3.5 w-3.5 text-gray-900" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.67 4H14V2h-4v2H8.33A1.33 1.33 0 007 5.33v15.34C7 21.4 7.6 22 8.33 22h7.34c.74 0 1.33-.6 1.33-1.33V5.33C17 4.6 16.4 4 15.67 4z" />
                </svg>
              </div>
            </div>

            {/* LinkedIn nav bar */}
            <div className="flex items-center justify-between bg-white px-3 py-2 border-b border-gray-200">
              <svg className="h-8 w-8 text-blue-700" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <div className="flex-1 mx-2 rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-500">
                Search
              </div>
              <svg className="h-6 w-6 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>

            {/* Feed background with post */}
            <div className="overflow-y-auto bg-[#f3f2ef] p-2" style={{ maxHeight: 620 }}>
              {children}
            </div>
          </div>
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-1 w-32 rounded-full bg-gray-600" />
      </div>
    </div>
  );
}

export default function LinkedInPostMockup(props: LinkedInPostMockupProps) {
  if (props.phoneFrame) {
    return (
      <PhoneFrame>
        <LinkedInCard {...props} />
      </PhoneFrame>
    );
  }

  return (
    <div className="rounded-xl bg-[#f3f2ef] p-6 print:bg-white print:p-0">
      <LinkedInCard {...props} />
    </div>
  );
}
