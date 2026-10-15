"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface Suggestion {
  id: string;
  thumbUrl: string | null;
  label: string | null;
}

/**
 * Three photos from the venue's library that suit this post, chosen from the
 * labels on each photo, best first. One tap uses a photo; "Pick one for me"
 * uses the best match. Says plainly when the library is empty.
 */
export default function PhotoSuggestions({
  companyId,
  postType,
  pieceId,
  selectedId,
  onPick,
  disabled,
}: {
  companyId: string;
  postType: string;
  pieceId?: string;
  selectedId?: string | null;
  onPick: (s: Suggestion) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(false);
    const qs = new URLSearchParams({ companyId, postType, ...(pieceId ? { pieceId } : {}) });
    fetch(`/api/hospitality/photo-suggestions?${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return ((await res.json()).photos as Suggestion[]) || [];
      })
      .then((p) => live && setItems(p))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [companyId, postType, pieceId]);

  if (error) return <p className="text-xs text-gray-500">Suggestions are not available just now. You can choose from the whole library.</p>;
  if (items === null) return <p className="text-xs text-gray-500">Finding photos that suit this post</p>;
  if (items.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        No photos to suggest yet. <Link href="/library" className="underline">Add some to your library</Link> and we will suggest the best ones for each post.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-700">Suggested for this post</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(items[0])}
          className="min-h-11 rounded-md border border-violet-300 bg-violet-50 px-3 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
        >
          Pick one for me
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              aria-pressed={selectedId === s.id}
              aria-label={s.label ? `Use the photo: ${s.label}` : "Use this photo"}
              className={`block aspect-square w-full overflow-hidden rounded-md border-2 disabled:opacity-50 ${selectedId === s.id ? "border-violet-600" : "border-transparent hover:border-violet-300"}`}
            >
              {s.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gray-100 px-1 text-center text-xs text-gray-500">{s.label || "Photo"}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
