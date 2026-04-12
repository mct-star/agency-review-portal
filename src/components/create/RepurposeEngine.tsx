"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ── Types ───────────────────────────────────────────────────── */

interface RepurposeEngineProps {
  companies: { id: string; name: string }[];
  showCompanyPicker: boolean;
}

interface SocialPost {
  postType: string;
  title: string;
  body: string;
}

interface Carousel {
  title: string;
  slides: string[];
}

interface NewsletterIntro {
  subject: string;
  body: string;
}

interface RepurposeResult {
  socialPosts: SocialPost[];
  carousel: Carousel;
  newsletterIntro: NewsletterIntro;
}

/* ── Post type config ────────────────────────────────────────── */

const POST_TYPE_META: Record<string, { label: string; badgeColor: string; borderColor: string }> = {
  insight:       { label: "Insight",          badgeColor: "border-blue-500 bg-blue-50 text-blue-700",         borderColor: "border-l-blue-500" },
  contrarian:    { label: "Contrarian Take",  badgeColor: "border-orange-500 bg-orange-50 text-orange-700",   borderColor: "border-l-orange-500" },
  if_i_was:      { label: "If I Was...",      badgeColor: "border-purple-500 bg-purple-50 text-purple-700",   borderColor: "border-l-purple-500" },
  launch_story:  { label: "Launch Story",     badgeColor: "border-emerald-500 bg-emerald-50 text-emerald-700", borderColor: "border-l-emerald-500" },
  tactical:      { label: "Tactical",         badgeColor: "border-amber-500 bg-amber-50 text-amber-700",     borderColor: "border-l-amber-500" },
  carousel:      { label: "Carousel",         badgeColor: "border-pink-500 bg-pink-50 text-pink-700",        borderColor: "border-l-pink-500" },
  newsletter:    { label: "Newsletter Intro", badgeColor: "border-indigo-500 bg-indigo-50 text-indigo-700",   borderColor: "border-l-indigo-500" },
};

const FALLBACK_META = { label: "Content", badgeColor: "border-gray-400 bg-gray-50 text-gray-700", borderColor: "border-l-gray-400" };

/* ── Progress steps ──────────────────────────────────────────── */

const PROGRESS_STEPS = [
  "Analysing source content...",
  "Generating 5 social posts...",
  "Generating carousel...",
  "Generating newsletter intro...",
  "Finalising output...",
];

/* ── Component ───────────────────────────────────────────────── */

export default function RepurposeEngine({ companies, showCompanyPicker }: RepurposeEngineProps) {
  const router = useRouter();

  // Input state
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [inputMode, setInputMode] = useState<"text" | "url">("text");

  // Processing state
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Output state
  const [result, setResult] = useState<RepurposeResult | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canGenerate =
    !generating &&
    companyId &&
    (inputMode === "text" ? sourceText.trim().length >= 100 : sourceUrl.trim().length > 10);

  /* ── Generate handler ────────────────────────────────────── */

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    setProgressStep(0);

    // Simulate progress while waiting for API
    const interval = setInterval(() => {
      setProgressStep((prev) => Math.min(prev + 1, PROGRESS_STEPS.length - 1));
    }, 3000);

    try {
      const res = await fetch("/api/create/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          content: inputMode === "text" ? sourceText.trim() : undefined,
          url: inputMode === "url" ? sourceUrl.trim() : undefined,
        }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const data: RepurposeResult = await res.json();
      setResult(data);
      setProgressStep(PROGRESS_STEPS.length);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }, [companyId, inputMode, sourceText, sourceUrl]);

  /* ── Copy handler ──────────────────────────────────────── */

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  /* ── Send to Quick Generate ────────────────────────────── */

  function handleSendToQuickGenerate(title: string) {
    const params = new URLSearchParams({ topic: title });
    router.push(`/generate/quick?${params.toString()}`);
  }

  /* ── Toggle expand ─────────────────────────────────────── */

  function toggleExpand(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Input Section ──────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          {/* Input mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputMode("text")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === "text"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setInputMode("url")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === "url"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              From URL
            </button>
          </div>

          {/* Text input */}
          {inputMode === "text" && (
            <div>
              <label htmlFor="source-text" className="block text-sm font-medium text-gray-700">
                Paste your blog post, article, or long-form content here
              </label>
              <textarea
                id="source-text"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste your blog post or article here (minimum 100 characters)..."
                rows={12}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                {sourceText.length} characters
                {sourceText.length > 0 && sourceText.length < 100 && " (minimum 100)"}
              </p>
            </div>
          )}

          {/* URL input */}
          {inputMode === "url" && (
            <div>
              <label htmlFor="source-url" className="block text-sm font-medium text-gray-700">
                Or paste a URL to extract content from
              </label>
              <input
                id="source-url"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/blog/your-article"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Company selector */}
          {showCompanyPicker && (
            <div>
              <label htmlFor="repurpose-company" className="block text-sm font-medium text-gray-700">
                Company
              </label>
              <select
                id="repurpose-company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {generating ? "Repurposing..." : "Repurpose"}
          </button>
        </div>
      </div>

      {/* ── Progress Section ───────────────────────────────── */}
      {generating && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }}
              />
            </div>
            <p className="text-sm font-medium text-amber-800">
              {PROGRESS_STEPS[progressStep]}
            </p>
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Output Section ─────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Generated Content ({(result.socialPosts?.length ?? 0) + 2} pieces)
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Social Posts */}
            {result.socialPosts?.map((post, i) => {
              const cardId = `social-${i}`;
              const meta = POST_TYPE_META[post.postType] || FALLBACK_META;
              const isExpanded = expandedCards.has(cardId);
              const isCopied = copiedId === cardId;

              return (
                <div
                  key={cardId}
                  className={`rounded-lg border border-gray-200 border-l-4 ${meta.borderColor} bg-white p-4 shadow-sm`}
                >
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badgeColor}`}>
                    {meta.label}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">{post.title}</h3>
                  <div className="mt-2">
                    <p className="whitespace-pre-wrap text-sm text-gray-600">
                      {isExpanded ? post.body : post.body.slice(0, 200)}
                      {!isExpanded && post.body.length > 200 && "..."}
                    </p>
                    {post.body.length > 200 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(cardId)}
                        className="mt-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(post.body, cardId)}
                      className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      {isCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendToQuickGenerate(post.title)}
                      className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                    >
                      Send to Quick Generate
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Carousel */}
            {result.carousel && (() => {
              const carouselMeta = POST_TYPE_META.carousel;
              return (
                <div className={`rounded-lg border border-gray-200 border-l-4 ${carouselMeta.borderColor} bg-white p-4 shadow-sm`}>
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${carouselMeta.badgeColor}`}>
                    {carouselMeta.label}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">{result.carousel.title}</h3>
                  <div className="mt-2 space-y-1.5">
                    {result.carousel.slides.map((slide, i) => (
                      <p key={i} className="text-sm text-gray-600">
                        <span className="font-medium text-gray-800">Slide {i + 1}:</span> {slide}
                      </p>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          result.carousel.slides.map((s, idx) => `Slide ${idx + 1}: ${s}`).join("\n\n"),
                          "carousel"
                        )
                      }
                      className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      {copiedId === "carousel" ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendToQuickGenerate(result.carousel.title)}
                      className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                    >
                      Send to Quick Generate
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Newsletter Intro */}
            {result.newsletterIntro && (() => {
              const nlMeta = POST_TYPE_META.newsletter;
              return (
                <div className={`rounded-lg border border-gray-200 border-l-4 ${nlMeta.borderColor} bg-white p-4 shadow-sm`}>
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${nlMeta.badgeColor}`}>
                    {nlMeta.label}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">
                    Subject: {result.newsletterIntro.subject}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                    {result.newsletterIntro.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `Subject: ${result.newsletterIntro.subject}\n\n${result.newsletterIntro.body}`,
                          "newsletter"
                        )
                      }
                      className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      {copiedId === "newsletter" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
