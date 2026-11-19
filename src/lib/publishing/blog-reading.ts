import { parseImageRecord } from "@/lib/publishing/blog-image-record";
import { HERO_ARCHETYPE } from "@/lib/publishing/blog-gate-input";
import { inArticleImageNumber } from "@/lib/publishing/website-blog";

/**
 * A blog as the reviewer reads it in the portal (19 Nov 2026): in order, as
 * agencymedicalmarketing.com will show it. Pure, so the week review card
 * and the piece page read it the same way and the tests see exactly that.
 *
 * - The hero (hero_image_prompt) comes first, as the site puts it above
 *   the article. A [[image: hero]] line is that hero, so it adds nothing.
 * - Each [[image: n]] line becomes inline image n (in_article_image_prompt_n,
 *   the last row with a file, as the publisher picks it) with its alt text
 *   and its caption from the image record, the line the site prints under it.
 * - A slot with no image, or a placeholder line the writer left
 *   ("[INFOGRAPHIC: ...]"), shows as a note: it will not publish.
 * - The share card is not part of the article.
 * Inline images the body never places come back in `unplaced`.
 */

export interface ReadingImageRow {
  id: string;
  archetype: string | null;
  public_url: string | null;
  image_record?: unknown;
}

export interface ReadingImage {
  kind: "image";
  id: string;
  role: "hero" | "inline";
  n?: number;
  src: string;
  alt: string;
  caption: string;
}

export type ReadingBlock =
  | { kind: "text"; markdown: string }
  | ReadingImage
  | { kind: "missing"; label: string };

const SLOT = /^\s*\[\[\s*image:\s*([a-z0-9]+)\s*\]\]\s*$/i;
const PLACEHOLDER = /^\s*(IMAGE PLACEMENT\b|\[(IMAGE|INFOGRAPHIC|DIAGRAM)\b)/i;

function image(row: ReadingImageRow, role: "hero" | "inline", n?: number): ReadingImage {
  const record = parseImageRecord(row.image_record);
  return {
    kind: "image", id: row.id, role, ...(n !== undefined ? { n } : {}),
    src: row.public_url || "", alt: (record?.alt || "").trim(), caption: (record?.caption || "").trim(),
  };
}

export function blogReadingBlocks(body: string, rows: ReadingImageRow[]): { blocks: ReadingBlock[]; unplaced: ReadingImage[] } {
  const hero = rows.find(r => r.archetype === HERO_ARCHETYPE && r.public_url);
  const byNumber = new Map<number, ReadingImageRow>();
  for (const r of rows) {
    const n = inArticleImageNumber(r.archetype);
    if (n !== null && r.public_url) byNumber.set(n, r);
  }

  const blocks: ReadingBlock[] = [];
  if (hero) blocks.push(image(hero, "hero"));
  const placed = new Set<number>();
  let text: string[] = [];
  const flush = () => {
    const markdown = text.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (markdown) blocks.push({ kind: "text", markdown });
    text = [];
  };

  for (const line of (body || "").replace(/\r\n/g, "\n").split("\n")) {
    const slot = line.match(SLOT);
    if (slot) {
      const key = slot[1].toLowerCase();
      if (key === "hero") {
        if (!hero) { flush(); blocks.push({ kind: "missing", label: "The hero image is not attached yet." }); }
        continue;
      }
      flush();
      const n = Number(key);
      const row = Number.isInteger(n) ? byNumber.get(n) : undefined;
      if (row) { blocks.push(image(row, "inline", n)); placed.add(n); }
      else blocks.push({ kind: "missing", label: `Image ${key} is not attached yet.` });
      continue;
    }
    if (PLACEHOLDER.test(line)) {
      flush();
      blocks.push({ kind: "missing", label: `A placeholder, not an image slot, so it will not publish: ${line.trim()}` });
      continue;
    }
    text.push(line);
  }
  flush();

  const unplaced = [...byNumber.entries()].sort(([a], [b]) => a - b)
    .filter(([n]) => !placed.has(n)).map(([n, row]) => image(row, "inline", n));
  return { blocks, unplaced };
}
