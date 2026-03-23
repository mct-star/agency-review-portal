"use client";

/**
 * PostShowcase — shows the anatomy of a complete generated post
 * to make clear that the platform produces EVERYTHING, not just images.
 * Displayed as a LinkedIn-style post mockup with labelled parts.
 */

export default function PostShowcase() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid gap-8 items-start lg:grid-cols-[1fr_340px]">
        {/* Left: The LinkedIn post mockup */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-md overflow-hidden">
          {/* Post header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-3">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              JH
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Jessica Hughes</p>
              <p className="text-xs text-gray-400">VP Commercial, MedTech Innovations</p>
            </div>
          </div>

          {/* Post copy — the hook */}
          <div className="px-5 pb-3">
            <p className="text-[13.5px] leading-relaxed text-gray-800">
              <span className="font-semibold">We launched 3 products last year.</span>
              <br /><br />
              Two had great clinical data, strong KOL support, and six-figure marketing budgets.
              <br /><br />
              They both missed their launch targets.
              <br /><br />
              The third had half the budget, no KOL network, and a marketing team of two.
              <br /><br />
              It hit 140% of target in 90 days.
              <br /><br />
              The difference? The third team started the demand conversation 6 months before launch. The other two waited until they had &quot;something to sell.&quot;
              <br /><br />
              <span className="text-gray-500">Enjoy this? &#x267B;&#xFE0F; Repost it to your network and follow Jessica Hughes for more.</span>
            </p>
          </div>

          {/* Post image — a quote card style */}
          <div className="mx-5 mb-3 rounded-xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-8 py-10 text-center">
              <p className="text-xl font-bold text-white leading-snug">
                &ldquo;The launch doesn&apos;t start<br />when the product is ready.<br />It starts when the<br />market is.&rdquo;
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold text-white">JH</div>
                <span className="text-xs text-emerald-100 font-medium">Jessica Hughes</span>
              </div>
              <div className="mt-3 text-white/60">
                <svg className="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
            </div>
          </div>

          {/* Engagement bar */}
          <div className="flex items-center justify-between px-5 py-2 border-t border-gray-100">
            <div className="flex items-center gap-1">
              <div className="flex -space-x-1">
                <span className="inline-block h-4 w-4 rounded-full bg-blue-500" />
                <span className="inline-block h-4 w-4 rounded-full bg-red-400" />
                <span className="inline-block h-4 w-4 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-gray-400 ml-1">47</span>
            </div>
            <span className="text-xs text-gray-400">12 comments</span>
          </div>

          {/* First comment */}
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
            <div className="flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                JH
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700">Jessica Hughes <span className="font-normal text-gray-400">&#183; Author</span></p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Want the framework we used? I put together a guide on building pre-launch demand. Grab it here &#x2192; <span className="text-blue-600">medtechinnovations.com/demand-guide</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Anatomy labels */}
        <div className="space-y-4 lg:pt-4">
          <h3 className="text-lg font-bold text-gray-900 mb-6">
            Every post. Complete.
          </h3>

          {/* Label items */}
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Voice-matched copy</p>
              <p className="text-xs text-gray-500">Written in your voice. Hook, body, sign-off. Not generic AI slop.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Scroll-stopping visual</p>
              <p className="text-xs text-gray-500">Quote cards, Cinematic 3D, editorial photography, or scene quotes. Auto-matched to post type.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">First comment CTA</p>
              <p className="text-xs text-gray-500">A strategic call-to-action that drives traffic to your guide, newsletter, or booking page.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Compliance reviewed</p>
              <p className="text-xs text-gray-500">Every sentence checked against regulatory frameworks before it goes live.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 12L3.27 3.13A59.77 59.77 0 0121.49 12 59.77 59.77 0 013.27 20.87L6 12zm0 0h7.5" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">One-click publish</p>
              <p className="text-xs text-gray-500">Post directly to LinkedIn with image and first comment. No copy-pasting.</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500 text-center">
              <span className="font-semibold text-gray-700">This is one click.</span> Topic in, complete post out. Copy, image, first comment, compliance check. Done.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
