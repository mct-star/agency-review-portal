"use client";

import MarkdownRenderer from "./MarkdownRenderer";
import BlogEnding from "./BlogEnding";
import { blogReadingBlocks, type ReadingImage, type ReadingImageRow } from "@/lib/publishing/blog-reading";

/**
 * A blog read the way the website will show it (19 Nov 2026): the hero,
 * the text, each inline image where the writer placed it, and the caption
 * under it. Order and captions come from blogReadingBlocks.
 */
function Figure({ image }: { image: ReadingImage }) {
  return (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} className="w-full rounded-lg border border-gray-200" />
      {image.caption && (
        <figcaption className="mt-2 text-center text-sm italic text-gray-600">{image.caption}</figcaption>
      )}
    </figure>
  );
}

export default function BlogArticleView({ markdown, images }: { markdown: string; images: ReadingImageRow[] }) {
  const { blocks, unplaced } = blogReadingBlocks(markdown, images);
  return (
    <div>
      {blocks.map((block, i) => {
        if (block.kind === "text") return <MarkdownRenderer key={i} content={block.markdown} />;
        if (block.kind === "image") return <Figure key={`${block.id}-${i}`} image={block} />;
        return (
          <p key={i} className="my-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {block.label}
          </p>
        );
      })}
      {unplaced.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase text-gray-500">Attached but not placed in the article</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {unplaced.map(image => <Figure key={image.id} image={image} />)}
          </div>
        </div>
      )}
      <BlogEnding />
    </div>
  );
}
