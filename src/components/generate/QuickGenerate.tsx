"use client";

import { useState, useMemo } from "react";
import LinkedInPreview from "@/components/content/LinkedInPreview";

/**
 * Quick Generate — the "make me a post" experience.
 *
 * Lives on the dashboard. User picks a company, a person (spokesperson),
 * a topic, post type, and platform, hits generate, and gets copy-ready
 * content with an image.
 */

interface PostTypeOption {
  slug: string;
  label: string;
  description: string;
  archetype: string;
  color: string;
}

const POST_TYPES: PostTypeOption[] = [
  {
    slug: "insight",
    label: "Problem Diagnosis",
    description: "Identify a common mistake your audience makes. 150-250 words.",
    archetype: "quote_card_green",
    color: "#CDD856",
  },
  {
    slug: "launch_story",
    label: "Experience Story",
    description: "Share a real experience with pattern recognition. 200-350 words.",
    archetype: "pixar_healthcare",
    color: "#41CDA9",
  },
  {
    slug: "if_i_was",
    label: "Expert Perspective",
    description: "\"If I was in your role...\" practical advice. 200-300 words.",
    archetype: "quote_card_purple",
    color: "#A27BF9",
  },
  {
    slug: "contrarian",
    label: "Contrarian Take",
    description: "Challenge a widely-held industry assumption. 200-300 words.",
    archetype: "quote_card_blue",
    color: "#41C9FE",
  },
  {
    slug: "tactical",
    label: "Tactical How-To",
    description: "Actionable steps to solve a specific problem. 150-250 words.",
    archetype: "carousel",
    color: "#CDD856",
  },
  {
    slug: "founder_friday",
    label: "Personal Reflection",
    description: "Behind the scenes: expectations vs reality. 250-400 words.",
    archetype: "pixar_fantasy",
    color: "#F59E0B",
  },
  {
    slug: "blog_teaser",
    label: "Article Teaser",
    description: "Drive traffic to a longer piece of content. 60-120 words.",
    archetype: "carousel",
    color: "#A27BF9",
  },
];

interface CompanyOption {
  id: string;
  name: string;
  authorName: string;
  authorTagline: string;
  brandColor: string;
  profilePictureUrl?: string | null;
}

interface SpokespersonOption {
  id: string;
  companyId: string;
  name: string;
  tagline: string;
  profilePictureUrl: string | null;
  isPrimary: boolean;
}

interface QuickGenerateProps {
  companies: CompanyOption[];
  spokespersons?: SpokespersonOption[];
  showCompanyPicker?: boolean;
}

type GenerationState = "idle" | "generating" | "complete" | "error";

interface GeneratedResult {
  postText: string;
  firstComment: string | null;
  imageUrl: string | null;
  postType: string;
}

export default function QuickGenerate({
  companies,
  spokespersons = [],
  showCompanyPicker = false,
}: QuickGenerateProps) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption>(companies[0]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [selectedPostType, setSelectedPostType] = useState<PostTypeOption | null>(null);
  const [platform, setPlatform] = useState<"linkedin" | "x" | "instagram">("linkedin");
  const [state, setState] = useState<GenerationState>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [applyingOverlay, setApplyingOverlay] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  // Filter spokespersons for the selected company
  const companyPeople = useMemo(
    () => spokespersons.filter((s) => s.companyId === selectedCompany.id),
    [spokespersons, selectedCompany.id]
  );

  // Selected person (or primary fallback)
  const selectedPerson = useMemo(() => {
    if (selectedPersonId) return companyPeople.find((p) => p.id === selectedPersonId) || null;
    return companyPeople.find((p) => p.isPrimary) || companyPeople[0] || null;
  }, [companyPeople, selectedPersonId]);

  // Author info for preview — use selected person if available, otherwise company defaults
  const authorName = selectedPerson?.name || selectedCompany.authorName;
  const authorTagline = selectedPerson?.tagline || selectedCompany.authorTagline;
  const authorAvatar = selectedPerson?.profilePictureUrl || selectedCompany.profilePictureUrl;

  async function handleGenerate() {
    if (!topic.trim() || !selectedPostType) return;
    setState("generating");
    setError(null);
    setResult(null);
    setProgress("Creating content...");

    try {
      const contentRes = await fetch("/api/generate/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          topic: topic.trim(),
          postTypeSlug: selectedPostType.slug,
          platform,
        }),
      });

      if (!contentRes.ok) {
        const err = await contentRes.json();
        throw new Error(err.error || "Content generation failed");
      }

      const data = await contentRes.json();

      const generated: GeneratedResult = {
        postText: data.postText,
        firstComment: data.firstComment,
        imageUrl: data.imageUrl || null,
        postType: selectedPostType.slug,
      };

      setResult(generated);
      setCurrentImageUrl(generated.imageUrl);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.postText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyFirstComment() {
    if (!result?.firstComment) return;
    await navigator.clipboard.writeText(result.firstComment);
  }

  async function handleApplyOverlay() {
    if (!currentImageUrl) return;
    setApplyingOverlay(true);
    setOverlayError(null);
    try {
      const res = await fetch("/api/generate/overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: currentImageUrl, companyId: selectedCompany.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Overlay failed");
      if (json.url) {
        setCurrentImageUrl(json.url);
      } else {
        throw new Error("No URL returned from overlay");
      }
    } catch (err) {
      setOverlayError(err instanceof Error ? err.message : "Overlay failed");
    } finally {
      setApplyingOverlay(false);
    }
  }

  function handleReset() {
    setState("idle");
    setResult(null);
    setCurrentImageUrl(null);
    setError(null);
    setProgress("");
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Quick Generate</h2>
        <p className="text-sm text-gray-500">
          Create a single post instantly. No planning required.
        </p>
      </div>

      {state === "idle" || state === "error" ? (
        <div className="p-6 space-y-5">
          {/* Company + Person selector */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Company selector */}
            {showCompanyPicker ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Company
                </label>
                <select
                  value={selectedCompany.id}
                  onChange={(e) => {
                    const c = companies.find((co) => co.id === e.target.value);
                    if (c) {
                      setSelectedCompany(c);
                      setSelectedPersonId(null); // Reset person when company changes
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Company
                </label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900">
                  {selectedCompany.name}
                </div>
              </div>
            )}

            {/* Person selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Posting as
              </label>
              {companyPeople.length > 0 ? (
                <select
                  value={selectedPerson?.id || ""}
                  onChange={(e) => setSelectedPersonId(e.target.value || null)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {companyPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.isPrimary ? " (Primary)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
                  {selectedCompany.authorName}
                </div>
              )}
            </div>
          </div>

          {/* Selected person preview */}
          {selectedPerson && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5">
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-gray-200">
                {authorAvatar ? (
                  <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-200 text-[10px] font-bold text-gray-500">
                    {authorName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{authorName}</p>
                <p className="text-[11px] text-gray-500">{authorTagline}</p>
              </div>
            </div>
          )}

          {/* Topic input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              What do you want to post about?
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why most healthcare product launches fail in the first 90 days..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            />
          </div>

          {/* Post type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Post type
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {POST_TYPES.map((pt) => (
                <button
                  key={pt.slug}
                  onClick={() => setSelectedPostType(pt)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selectedPostType?.slug === pt.slug
                      ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: pt.color }}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {pt.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                    {pt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Platform selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform
            </label>
            <div className="flex gap-2">
              {(["linkedin", "x", "instagram"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    platform === p
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {p === "linkedin" ? "LinkedIn" : p === "x" ? "X (Twitter)" : "Instagram"}
                </button>
              ))}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || !selectedPostType}
            className="w-full rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate Post
          </button>
        </div>
      ) : state === "generating" ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
          <p className="text-sm font-medium text-gray-900">{progress}</p>
          <p className="mt-1 text-xs text-gray-500">This usually takes 15-30 seconds</p>
        </div>
      ) : state === "complete" && result ? (
        <div className="p-6 space-y-6">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-green-700">Post generated</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {copied ? "Copied!" : "Copy text"}
              </button>
              {currentImageUrl && (
                <a
                  href={currentImageUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Download image
                </a>
              )}
              {currentImageUrl && (
                <button
                  onClick={handleApplyOverlay}
                  disabled={applyingOverlay}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {applyingOverlay ? "Applying..." : "Apply overlay"}
                </button>
              )}
              <button
                onClick={handleReset}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                New post
              </button>
            </div>
          </div>

          {/* Overlay error */}
          {overlayError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              Overlay error: {overlayError}
            </div>
          )}

          {/* LinkedIn Preview */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <LinkedInPreview
              authorName={authorName}
              authorTagline={authorTagline}
              authorAvatarUrl={authorAvatar || undefined}
              postText={result.postText}
              firstComment={result.firstComment}
              postType={result.postType}
              imageUrl={currentImageUrl}
              brandColor={selectedCompany.brandColor}
            />
          </div>

          {/* First comment (copyable) */}
          {result.firstComment && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  First Comment
                </h3>
                <button
                  onClick={handleCopyFirstComment}
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  Copy
                </button>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {result.firstComment}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
