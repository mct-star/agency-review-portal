/**
 * Dictated review notes: the pure rules behind the dictate bar on
 * /content/[pieceId]. Which paragraph a note belongs to, how its opening
 * words are quoted, the reading order and the plain-text copy-out.
 */

export interface ReviewNote {
  id: string;
  content_piece_id: string;
  paragraph_index: number | null;
  paragraph_quote: string | null;
  body: string;
  created_at: string;
}

/** A rendered block of the article, measured against the viewport. */
export interface BlockBox {
  top: number;
  bottom: number;
}

/** The blocks of the rendered body a note can be anchored to. */
export const REVIEW_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre";

/** Where the reader's eye is taken to be: a third of the way down the screen. */
export const READING_LINE = 1 / 3;

export const QUOTE_WORDS = 8;
export const MAX_NOTE_LENGTH = 5000;

/**
 * The block in view when the reader pressed dictate. The one crossing the
 * reading line wins; otherwise the visible block nearest to it; otherwise
 * null (nothing of the article is on screen, so the note is on the whole
 * piece). Blocks are in document order and measured from the viewport top.
 */
export function pickBlockInView(blocks: BlockBox[], viewportHeight: number): number | null {
  if (blocks.length === 0 || viewportHeight <= 0) return null;
  const line = viewportHeight * READING_LINE;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const { top, bottom } = blocks[i];
    if (bottom <= top) continue; // hidden or empty
    if (top <= line && bottom > line) return i;
    const visible = bottom > 0 && top < viewportHeight;
    if (!visible) continue;
    const distance = top > line ? top - line : line - bottom;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/** The opening words of a paragraph, as the note quotes it. */
export function paragraphQuote(text: string, words = QUOTE_WORDS): string {
  const parts = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const head = parts.slice(0, words).join(" ");
  return parts.length > words ? `${head}...` : head;
}

/** Article order: by paragraph, whole-piece notes last, then the order spoken. */
export function sortNotes<T extends Pick<ReviewNote, "paragraph_index" | "created_at">>(notes: T[]): T[] {
  return [...notes].sort((a, b) => {
    const pa = a.paragraph_index ?? Number.MAX_SAFE_INTEGER;
    const pb = b.paragraph_index ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * One plain-text list for pasting into an email, a chat or an edit brief:
 *
 *   Review notes | <title>
 *
 *   1. "Opening words of the paragraph..."
 *   The note as spoken.
 *
 *   2. Whole piece
 *   A note made with no paragraph on screen.
 */
export function formatNotesForCopy(title: string, notes: Pick<ReviewNote, "paragraph_index" | "paragraph_quote" | "body" | "created_at">[]): string {
  const heading = `Review notes | ${title.trim() || "Untitled"}`;
  if (notes.length === 0) return `${heading}\n\nNo notes yet.`;
  const items = sortNotes(notes).map((note, i) => {
    const anchor = note.paragraph_quote?.trim() ? `"${note.paragraph_quote.trim()}"` : "Whole piece";
    return `${i + 1}. ${anchor}\n${note.body.trim()}`;
  });
  return `${heading}\n\n${items.join("\n\n")}`;
}
