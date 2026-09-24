"use client";

import { useState } from "react";
import { toLinkedInText, seeMoreFold, type FeedDevice } from "@/lib/linkedin/post-text";
import type { PieceMedia, MediaItem } from "@/lib/content/piece-media";

interface LinkedInPreviewProps {
  authorName: string;
  authorTagline?: string;
  authorAvatarUrl?: string;
  /** The stored body. It is converted with the same function the publish route uses. */
  postText: string;
  firstComment: string | null;
  /** What will actually be attached, from resolvePieceMedia. Preferred over imageUrl. */
  media?: PieceMedia | null;
  /** Legacy single image, used only when media is not supplied. */
  imageUrl?: string | null;
  postType?: string | null;
  brandColor?: string;
  companyLogoUrl?: string | null;
  linkedinProfileUrl?: string | null;
}

const WIDTH: Record<FeedDevice, number> = { desktop: 555, mobile: 375 };

/**
 * LinkedIn feed preview, built to match what the publish route sends:
 * the same text (toLinkedInText), the same media (resolvePieceMedia), the
 * fold where LinkedIn puts "...more" on desktop and on a phone. Nothing is
 * shown that will not post: a text-only post shows no image.
 */
export default function LinkedInPreview({
  authorName,
  authorTagline = "Healthcare Demand Generation",
  authorAvatarUrl,
  postText,
  firstComment,
  media,
  imageUrl,
  postType,
  brandColor = "#0a66c2",
  linkedinProfileUrl,
}: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [device, setDevice] = useState<FeedDevice>("desktop");

  const text = toLinkedInText(postText);
  const comment = firstComment ? toLinkedInText(firstComment) : null;
  const fold = seeMoreFold(text, device);
  const shown = expanded || !fold.folded ? text : fold.visible;
  const resolved: PieceMedia = media ?? (imageUrl ? { shape: "image", items: [{ kind: "image", url: imageUrl, alt: "" }] } : { shape: "none", items: [] });

  const initials = authorName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const authorLink = linkedinProfileUrl || "#";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
          {(["desktop", "mobile"] as FeedDevice[]).map((d) => (
            <button
              key={d}
              onClick={() => { setDevice(d); setExpanded(false); }}
              className={`rounded px-2.5 py-1 font-medium ${device === d ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {d === "desktop" ? "Desktop" : "Phone"}
            </button>
          ))}
        </div>
        <span className="text-gray-500">
          {mediaLabel(resolved)}
          {postType ? ` · ${postType.replace(/_/g, " ")}` : ""}
        </span>
      </div>

      <div className="mx-auto" style={{ maxWidth: WIDTH[device] }}>
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 p-4 pb-0">
            <a href={authorLink} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: brandColor }}>
                {authorAvatarUrl ? <img src={authorAvatarUrl} alt={authorName} className="h-12 w-12 rounded-full object-cover" /> : initials}
              </div>
            </a>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-gray-900">{authorName}</span>
                <span className="text-xs text-gray-500">• You</span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-1">{authorTagline}</p>
              <p className="mt-0.5 text-xs text-gray-500">Now • 🌐</p>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2">
            <div className="text-sm leading-[1.42] text-gray-900 whitespace-pre-wrap break-words">
              {shown}
              {fold.folded && !expanded && (
                <>
                  {"… "}
                  <button onClick={() => setExpanded(true)} className="text-gray-500 hover:text-gray-700 hover:underline">more</button>
                </>
              )}
            </div>
          </div>

          <MediaBlock media={resolved} />

          <div className="flex items-center justify-around border-t border-gray-100 px-2 py-1">
            {["Like", "Comment", "Repost", "Send"].map((label) => (
              <span key={label} className="px-3 py-2.5 text-xs font-semibold text-gray-500">{label}</span>
            ))}
          </div>
        </div>

        {comment && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: brandColor }}>
              {authorAvatarUrl ? <img src={authorAvatarUrl} alt={authorName} className="h-8 w-8 rounded-full object-cover" /> : initials}
            </div>
            <div className="min-w-0 flex-1 rounded-xl bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-900">{authorName}</span>
                <span className="rounded bg-gray-600 px-1 text-[10px] font-medium text-white">Author</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{comment}</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-400">
        Text and media are exactly what will post. The fold is LinkedIn&apos;s three-line cut, accurate to within a few words.
      </p>
    </div>
  );
}

function mediaLabel(m: PieceMedia): string {
  switch (m.shape) {
    case "none": return "Text only, no image";
    case "image": return "One image";
    case "images": return `${m.items.length} images`;
    case "video": return "Video";
    case "document": return "Document (PDF)";
  }
}

function MediaBlock({ media }: { media: PieceMedia }) {
  if (media.shape === "none") return null;
  if (media.shape === "video") {
    return <video src={media.items[0].url} controls playsInline className="block w-full bg-black" />;
  }
  if (media.shape === "document") {
    return (
      <div className="border-y border-gray-100 bg-gray-50">
        <p className="px-4 py-2 text-xs font-semibold text-gray-700">{media.items[0].alt || "Document"}</p>
        <iframe src={`${media.items[0].url}#view=FitH&toolbar=0`} title={media.items[0].alt || "Document"} className="h-[420px] w-full bg-white" />
      </div>
    );
  }
  if (media.shape === "image") {
    // LinkedIn shows a single image whole, at its own shape.
    return <img src={media.items[0].url} alt={media.items[0].alt} className="block h-auto w-full" />;
  }
  return <ImageGrid items={media.items} />;
}

/** LinkedIn's multi-image layouts: 2 side by side; 3 and more as one large over a row, "+N" on the last tile. */
function ImageGrid({ items }: { items: MediaItem[] }) {
  const tile = (it: MediaItem, key: string, extra?: number) => (
    <div key={key} className="relative aspect-square overflow-hidden bg-gray-100">
      <img src={it.url} alt={it.alt} className="h-full w-full object-cover" />
      {extra ? <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{extra}</div> : null}
    </div>
  );
  if (items.length === 2) {
    return <div className="grid grid-cols-2 gap-0.5">{items.map((it, i) => tile(it, String(i)))}</div>;
  }
  const rest = items.slice(1, 4);
  const hidden = items.length - 4;
  return (
    <div className="space-y-0.5">
      <img src={items[0].url} alt={items[0].alt} className="block h-auto w-full" />
      <div className={`grid gap-0.5 ${rest.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {rest.map((it, i) => tile(it, String(i), i === rest.length - 1 && hidden > 0 ? hidden : undefined))}
      </div>
    </div>
  );
}
