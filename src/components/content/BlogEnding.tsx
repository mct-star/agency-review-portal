import { BLOG_ENDING_RESOURCES } from "./blog-ending-resources";

/**
 * How a blog post ends on the website, in the live page order: primary call
 * to action, content routes, newsletter band, author strip and related posts,
 * tagline band, then the four-card resources carousel. Preview only: items 1
 * to 5 are labelled placeholders, the four cards are the real ones.
 */
const PLACEHOLDERS = [
  { label: "Call to action", note: "One primary call to action for this post." },
  { label: "Content routes", note: "A text-only block of routes to more reading." },
  { label: "Newsletter", note: "The newsletter sign-up band." },
  { label: "Author and related posts", note: "The author strip and any related posts." },
  { label: "Tagline band", note: "The AGENCY tagline band." },
] as const;

export default function BlogEnding() {
  return (
    <section
      aria-label="How this post ends on the website"
      className="mt-8 rounded-lg border border-dashed border-violet-300 bg-violet-50/40 p-4"
      data-blog-ending
    >
      <p className="text-xs font-semibold uppercase text-violet-700">How this post ends on the website</p>
      <p className="mt-1 text-xs text-gray-500">Preview only. Blocks 1 to 5 are placeholders in the order the page shows them; block 6 is the real carousel.</p>

      <ol className="mt-3 space-y-2">
        {PLACEHOLDERS.map((p, i) => (
          <li key={p.label} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            <span className="font-medium text-gray-900">{i + 1}. {p.label}.</span> {p.note}
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm font-medium text-gray-900">6. Resources carousel</p>
      <p className="mt-2 text-[11px] font-semibold uppercase text-violet-700">Useful before we ever speak</p>
      <p className="text-base font-semibold text-gray-900">Choose your next step.</p>
      <ul className="mt-2 flex snap-x gap-3 overflow-x-auto pb-2" data-blog-ending-tiles>
        {BLOG_ENDING_RESOURCES.map(r => (
          <li key={r.id} className="w-64 shrink-0 snap-start overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.shareImage} alt={r.title} width={1200} height={630} loading="lazy" className="aspect-[1200/630] w-full object-cover" />
            <div className="p-3">
              <p className="text-[11px] font-semibold uppercase text-violet-700">{r.tag}</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{r.title}</p>
              <p className="mt-1 text-xs text-gray-600">{r.body}</p>
              <a href={r.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-violet-700 hover:underline">
                {r.cta}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
