"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { seeMoreFold, type FeedDevice } from "@/lib/linkedin/post-text";
import type { PublishPreview } from "@/lib/linkedin/publish-preview";
import { ActionButtons } from "@/components/mockups/LinkedInPostMockup";

interface LinkedInPublishMockupProps {
  preview: PublishPreview;
  authorName: string;
  authorTagline?: string;
  authorAvatarUrl?: string | null;
  /** Where the fold falls. Defaults to the viewer's own screen width. */
  device?: FeedDevice;
}

/**
 * The post as LinkedIn will show it, drawn from the publish job payload:
 * author header, text with the "...see more" fold, the media the publisher
 * sends (a carousel is one PDF document, read a page at a time), the action
 * bar, then the first comment.
 */
export default function LinkedInPublishMockup({ preview, authorName, authorTagline, authorAvatarUrl, device: forced }: LinkedInPublishMockupProps) {
  const [device, setDevice] = useState<FeedDevice>(forced ?? "desktop");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (forced) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setDevice(mq.matches ? "mobile" : "desktop");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [forced]);

  const fold = seeMoreFold(preview.text, device);
  const shown = expanded || !fold.folded ? preview.text : fold.visible;

  return (
    <div className="mx-auto w-full max-w-[555px] min-w-0 space-y-2" data-testid="linkedin-publish-mockup">
      <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="flex items-start gap-2 px-4 pt-3">
          <Avatar name={authorName} url={authorAvatarUrl} size={48} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-gray-900">{authorName}</p>
            {authorTagline ? <p className="truncate text-xs text-gray-500">{authorTagline}</p> : null}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              now <span aria-hidden>•</span> <GlobeIcon />
            </p>
          </div>
        </header>

        <div className="px-4 pb-2 pt-2 text-sm leading-[1.42] text-gray-900 whitespace-pre-wrap break-words">
          {shown}
          {fold.folded && !expanded && (
            <>
              {"…"}
              <button type="button" onClick={() => setExpanded(true)} className="font-medium text-gray-500 hover:text-blue-700 hover:underline">
                see more
              </button>
            </>
          )}
        </div>

        <PublishMedia preview={preview} />

        <ActionButtons />
      </article>

      <FirstCommentBlock text={preview.firstComment} authorName={authorName} authorAvatarUrl={authorAvatarUrl} />
    </div>
  );
}

function PublishMedia({ preview }: { preview: PublishPreview }) {
  if (preview.mode === "pdf") return <DocumentCarousel title={preview.documentTitle || "Document"} pages={preview.imageUrls} />;
  if (preview.mode === "image") return <SingleImage url={preview.imageUrls[0]} />;
  if (preview.mode === "video" && preview.videoUrl) {
    return (
      <video
        src={preview.videoUrl}
        poster={preview.thumbnailUrl || undefined}
        controls
        playsInline
        preload="metadata"
        className="block max-h-[640px] w-full bg-black"
        data-testid="mockup-video"
      />
    );
  }
  return null;
}

/** LinkedIn shows one image whole, cropped only beyond 1.91:1 wide or 4:5 tall. */
function SingleImage({ url }: { url: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const clamped = ratio == null ? null : Math.min(1.25, Math.max(1 / 1.91, ratio));
  return (
    <div className="relative w-full overflow-hidden bg-gray-100" style={clamped ? { aspectRatio: `1 / ${clamped}` } : undefined} data-testid="mockup-single-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
        className={clamped ? "absolute inset-0 h-full w-full object-cover" : "block h-auto w-full"}
      />
    </div>
  );
}

/** LinkedIn's document viewer: title bar, one page at a time, swipe or arrows, "1 / 7". */
function DocumentCarousel({ title, pages }: { title: string; pages: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const go = (to: number) => {
    const el = track.current;
    const next = Math.max(0, Math.min(pages.length - 1, to));
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setPage(next);
  };
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="border-y border-gray-200 bg-gray-100" data-testid="mockup-document">
      <div className="flex items-center justify-between gap-3 bg-gray-900 px-3 py-2 text-white">
        <p className="min-w-0 truncate text-xs font-semibold">{title}</p>
        <p className="shrink-0 text-[11px] text-gray-300">{pages.length} pages</p>
      </div>
      <div className="relative">
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-roledescription="carousel"
          aria-label={title}
        >
          {pages.map((url, i) => (
            <div key={`${url}-${i}`} className="flex w-full shrink-0 snap-center items-center justify-center bg-white" aria-label={`Page ${i + 1} of ${pages.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Page ${i + 1}`} className="block h-auto max-h-[70vh] w-full object-contain" draggable={false} loading={i < 2 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
        {page > 0 && <ArrowButton side="left" onClick={() => go(page - 1)} />}
        {page < pages.length - 1 && <ArrowButton side="right" onClick={() => go(page + 1)} />}
      </div>
      <div className="flex items-center gap-3 bg-gray-900 px-3 py-2 text-white">
        <span className="shrink-0 text-xs tabular-nums" data-testid="mockup-page-counter">{page + 1} / {pages.length}</span>
        <div className="h-1 flex-1 overflow-hidden rounded bg-gray-600">
          <div className="h-full bg-white transition-all" style={{ width: `${((page + 1) / pages.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function ArrowButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-2" : "right-2"} flex h-10 w-10 items-center justify-center rounded-full bg-gray-900/75 text-white shadow hover:bg-gray-900`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d={side === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}

function FirstCommentBlock({ text, authorName, authorAvatarUrl }: { text: string | null; authorName: string; authorAvatarUrl?: string | null }) {
  if (!text) {
    return <p className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-600">This post has no first comment.</p>;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm" data-testid="mockup-first-comment">
        <Avatar name={authorName} url={authorAvatarUrl} size={32} />
        <div className="min-w-0 flex-1 rounded-xl bg-gray-100 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-gray-900">{authorName}</span>
            <span className="shrink-0 rounded bg-gray-600 px-1 text-[10px] font-medium text-white">Author</span>
            <span className="ml-auto shrink-0 text-[11px] text-gray-500">now</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{linkify(text)}</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-500">
        Posted as the first comment straight after the post. Until LinkedIn grants comment permission, the Mac publisher will not post a piece that has a first comment: the publish fails and nothing goes out.
      </p>
    </div>
  );
}

/** Web addresses in a comment show as links, as LinkedIn shows them. */
export function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-blue-700 hover:underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function Avatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="shrink-0 overflow-hidden rounded-full bg-[#0a66c2]" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-bold text-white" style={{ fontSize: size * 0.35 }}>{initials}</div>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-label="Anyone">
      <path d="M8 1a7 7 0 107 7 7 7 0 00-7-7zM3 8a5 5 0 01.1-1H5v1a1 1 0 001 1v2.9A5 5 0 013 8zm7.9 3.4A1 1 0 0010 11H9V9a1 1 0 00-1-1H6V6h1a1 1 0 001-1V4.1a5 5 0 012.9 7.3z" />
    </svg>
  );
}
