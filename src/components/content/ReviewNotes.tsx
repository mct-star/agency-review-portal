"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VoiceDictation from "@/components/ui/VoiceDictation";
import {
  REVIEW_BLOCK_SELECTOR, formatNotesForCopy, paragraphQuote, pickBlockInView, sortNotes, type ReviewNote,
} from "@/lib/content/review-notes";

interface ReviewNotesProps {
  pieceId: string;
  companyId: string;
  title: string;
}

interface Anchor {
  index: number | null;
  quote: string | null;
}

/** The article's anchorable blocks, innermost only (a list item's own paragraph, not both). */
function articleBlocks(): HTMLElement[] {
  const body = document.querySelector<HTMLElement>("[data-review-body]");
  if (!body) return [];
  return Array.from(body.querySelectorAll<HTMLElement>(REVIEW_BLOCK_SELECTOR))
    .filter((el) => !el.querySelector(REVIEW_BLOCK_SELECTOR) && (el.textContent || "").trim() !== "");
}

function anchorInView(): Anchor {
  const blocks = articleBlocks();
  const index = pickBlockInView(
    blocks.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }),
    window.innerHeight,
  );
  if (index === null) return { index: null, quote: null };
  return { index, quote: paragraphQuote(blocks[index].textContent || "") };
}

/**
 * Dictated feedback while reading (12 Nov 2026). A bar fixed to the bottom
 * of the screen: press, speak, and the note is saved against the paragraph
 * in view at the moment of pressing. The notes read back in article order
 * below the piece and copy out as one plain-text list.
 */
export default function ReviewNotes({ pieceId, companyId, title }: ReviewNotesProps) {
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<Anchor | null>(null);
  const anchorRef = useRef<Anchor>({ index: null, quote: null });
  const base = `/api/content/${encodeURIComponent(pieceId)}/notes`;

  useEffect(() => {
    let live = true;
    fetch(base)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) throw new Error(json.error || "Could not load the notes.");
        setNotes(json.notes || []);
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : "Could not load the notes."))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [base]);

  // Pressing the microphone fixes the paragraph, whatever is scrolled to while speaking.
  const handleBusy = useCallback((busy: boolean) => {
    if (busy) {
      anchorRef.current = anchorInView();
      setPending(anchorRef.current);
    } else {
      setPending(null);
    }
  }, []);

  const handleTranscription = useCallback(async (text: string) => {
    const anchor = anchorRef.current;
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, paragraphIndex: anchor.index, paragraphQuote: anchor.quote }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.note) throw new Error(json.error || "Could not save the note.");
      setNotes((current) => sortNotes([...current, json.note]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    }
  }, [base]);

  async function removeNote(id: string) {
    setError(null);
    const res = await fetch(`${base}?noteId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not remove the note.");
      return;
    }
    setNotes((current) => current.filter((n) => n.id !== id));
  }

  function showParagraph(index: number | null) {
    if (index === null) return;
    articleBlocks()[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function copyAll() {
    const text = formatNotesForCopy(title, notes);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* The list, read back in article order */}
      <section id="review-notes" className="workspace-panel scroll-mt-6 p-5 sm:p-6" aria-labelledby="review-notes-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 id="review-notes-heading" className="text-sm font-semibold text-gray-900">
            Dictated notes ({notes.length})
          </h3>
          <button
            type="button"
            onClick={copyAll}
            disabled={notes.length === 0}
            className="workspace-button workspace-button-secondary min-h-11"
          >
            {copied ? "Copied" : "Copy all notes"}
          </button>
        </div>
        {!loaded ? (
          <p className="text-sm text-gray-500">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No notes yet. Press Dictate a note at the bottom of the screen as you read, and each note is kept against the paragraph you are on.
          </p>
        ) : (
          <ol className="space-y-3">
            {notes.map((note, i) => (
              <li key={note.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    {note.paragraph_index !== null && note.paragraph_quote ? (
                      <button
                        type="button"
                        onClick={() => showParagraph(note.paragraph_index)}
                        className="text-left text-sm italic text-gray-500 hover:text-violet-700 hover:underline"
                      >
                        {i + 1}. &ldquo;{note.paragraph_quote}&rdquo;
                      </button>
                    ) : (
                      <p className="text-sm italic text-gray-500">{i + 1}. Whole piece</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-gray-900 [overflow-wrap:anywhere]">{note.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNote(note.id)}
                    className="min-h-11 shrink-0 px-2 text-sm text-gray-500 hover:text-red-600"
                    aria-label={`Remove note ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* The dictate bar, on screen however far the reader scrolls */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pointer-events-none"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div
          role="region"
          aria-label="Dictate feedback"
          className="pointer-events-auto flex w-full max-w-md flex-col gap-1 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:w-auto"
        >
          <div className="flex items-center justify-between gap-3">
            <VoiceDictation
              companyId={companyId}
              placeholder="Dictate a note"
              ariaLabel="Dictate a note on the paragraph in view"
              onBusyChange={handleBusy}
              onTranscription={handleTranscription}
            />
            <a href="#review-notes" className="flex min-h-11 items-center px-2 text-sm font-medium text-violet-700 hover:underline">
              {notes.length === 1 ? "1 note" : `${notes.length} notes`}
            </a>
          </div>
          {pending && (
            <p className="max-w-xs truncate px-2 text-xs text-gray-500" aria-live="polite">
              {pending.quote ? <>On: &ldquo;{pending.quote}&rdquo;</> : "On: the whole piece"}
            </p>
          )}
          {error && <p className="px-2 text-xs text-red-600" role="alert">{error}</p>}
        </div>
      </div>
    </>
  );
}
