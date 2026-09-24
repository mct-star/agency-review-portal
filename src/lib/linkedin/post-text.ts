/**
 * The one definition of what a LinkedIn post says.
 *
 * The preview and the publish route both call toLinkedInText, so what you
 * approve in the preview is character for character what LinkedIn shows.
 * Before this, the preview and the route each stripped markdown their own
 * way (the route dropped bullets and hashtags, the preview did not).
 *
 * LinkedIn's Posts API reads `commentary` as "little text", where
 * \ | { } @ [ ] ( ) < > # * _ ~ are markup. Unescaped, a bracket can end
 * the post early or turn text into a broken mention, so the route sends
 * escapeLittleText(toLinkedInText(body)) and the reader sees the plain text.
 */

/** Markdown in the stored body to the plain text a LinkedIn reader sees. */
export function toLinkedInText(markdown: string): string {
  return (markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")               // code blocks: removed
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")       // images: removed (media travel separately)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // links: text then the address
    .replace(/\*\*(.+?)\*\*/g, "$1")               // bold
    .replace(/__(.+?)__/g, "$1")                   // bold, underscore form
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?:;]|$)/gm, "$1$2") // italic, only as emphasis
    .replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=[\s).,!?:;]|$)/gm, "$1$2")   // italic, never snake_case
    .replace(/`([^`]+)`/g, "$1")                   // inline code
    .replace(/^#{1,6}\s+/gm, "")                   // headings
    .replace(/^>\s?/gm, "")                        // quotes
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")           // bullet markers
    .replace(/^[ \t]*\d+\.[ \t]+/gm, "")           // numbered markers
    .replace(/(^|\s)#[A-Za-z][\w-]*/g, "$1")       // hashtags: house style carries none
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const LITTLE_TEXT_RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/** Escape LinkedIn little-text markup so the text posts exactly as written. */
export function escapeLittleText(text: string): string {
  return text.replace(LITTLE_TEXT_RESERVED, (c) => `\\${c}`);
}

export type FeedDevice = "desktop" | "mobile";

/**
 * Where LinkedIn folds a post behind "...see more". LinkedIn shows about
 * three rendered lines; a blank line counts as a line. The characters per
 * line are measured feed widths (desktop 555px column, mobile 375px), so
 * the fold lands within a few words of LinkedIn's own. Everything after it
 * is exactly what shows when the reader expands the post.
 */
export function seeMoreFold(text: string, device: FeedDevice): { visible: string; folded: boolean } {
  const perLine = device === "desktop" ? 62 : 40;
  const maxLines = 3;
  let lines = 0;
  let cut = 0;
  const paragraphs = text.split("\n");
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const needed = Math.max(1, Math.ceil(p.length / perLine));
    if (lines + needed > maxLines) {
      const room = (maxLines - lines) * perLine;
      const slice = p.slice(0, room);
      const lastSpace = slice.lastIndexOf(" ");
      const head = slice.length < p.length && lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
      return { visible: (text.slice(0, cut) + head).trimEnd(), folded: true };
    }
    lines += needed;
    cut += p.length + 1;
  }
  return { visible: text, folded: false };
}
