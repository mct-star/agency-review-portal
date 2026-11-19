"use client";

import { useState } from "react";
import { CTA_CLUSTERS } from "@/lib/publishing/website-blog";
import type { BlogGateReport } from "@/lib/publishing/blog-gate";

/** The image checks the route reports: blocking when enforced, warnings when not. */
interface ImageChecks { enforced: boolean; report: BlogGateReport }

/**
 * A blog's route to agencymedicalmarketing.com (25 Sept 2026): make the
 * hero and share images from the writer's own prompts, preview exactly
 * what will be sent, then open a pull request on the website. Merging that
 * pull request is what puts it live. Admin only; the page decides.
 *
 * The preview asks for the full verdict (15 Nov 2026): every problem the
 * route found is listed, and the image checks are shown as blocking when
 * the company enforces them and as warnings when it does not.
 *
 * Website preview (19 Nov 2026): before approval, "Open a website preview"
 * opens the same pull request as a draft. Vercel builds it and posts the
 * preview link on the pull request, so the blog can be read exactly as the
 * site will show it. Sending after approval reuses that pull request.
 */
export default function WebsitePublishPanel({
  pieceId, companyId, isApproved, heroPrompt, coverPrompt, hasHero, hasOg, articlePrompts = [], articleDone = [], clusters = CTA_CLUSTERS,
  previewUrl: initialPreviewUrl = null,
}: {
  pieceId: string;
  companyId: string;
  isApproved: boolean;
  heroPrompt: string | null;
  coverPrompt: string | null;
  hasHero: boolean;
  hasOg: boolean;
  /** The writer's in-article image prompts, by slot number. */
  articlePrompts?: { n: number; prompt: string }[];
  /** Slot numbers that already have an image. */
  articleDone?: number[];
  /** The services the blog can point readers to: the company's own list. Empty means none is needed. */
  clusters?: ReadonlyArray<{ code: string; label: string }>;
  /** The website preview pull request already open for this blog, if any. */
  previewUrl?: string | null;
}) {
  const [cluster, setCluster] = useState("");
  const [busy, setBusy] = useState<null | "images" | "preview" | "send" | "website">(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [imageChecks, setImageChecks] = useState<ImageChecks | null>(null);
  const [preview, setPreview] = useState<{ files: { path: string }[]; mdx: string; liveUrl: string; missing?: string } | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const missingArticle = articlePrompts.filter(a => !articleDone.includes(a.n));

  async function makeImages() {
    const prompts = [
      ...(!hasHero && heroPrompt ? [{ prompt: heroPrompt, style: "hero_image_prompt", aspectRatio: "4:3" }] : []),
      ...(!hasOg && coverPrompt ? [{ prompt: coverPrompt, style: "cover_image_prompt", aspectRatio: "16:9" }] : []),
      ...missingArticle.map(a => ({ prompt: a.prompt, style: `in_article_image_prompt_${a.n}`, aspectRatio: "4:3" })),
    ];
    if (prompts.length === 0) return;
    setBusy("images"); setError(null); setMessage(null);
    try {
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, contentPieceId: pieceId, prompts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      setMessage("Images made. Refresh the page to see them.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function send(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "send"); setError(null); setMessage(null); setProblems([]);
    try {
      const res = await fetch("/api/publish/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, ctaCluster: cluster, dryRun, withChecks: true }),
      });
      const data = await res.json().catch(() => ({}));
      setImageChecks(data.imageChecks || null);
      if (!res.ok) {
        if (Array.isArray(data.problems) && data.problems.length > 0) {
          setProblems(data.problems); setPreview(null);
          setError(dryRun ? "This blog cannot be sent yet:" : "Nothing was sent:");
          return;
        }
        throw new Error(data.error || `Failed (${res.status})`);
      }
      if (dryRun) setPreview(data);
      else { setPrUrl(data.pullRequest); setPreview(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function openWebsitePreview() {
    setBusy("website"); setError(null); setMessage(null); setProblems([]);
    try {
      const res = await fetch("/api/publish/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, ctaCluster: cluster, preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      setImageChecks(data.imageChecks || null);
      if (!res.ok) {
        if (Array.isArray(data.problems) && data.problems.length > 0) {
          setProblems(data.problems);
          setError("The website preview could not be opened:");
          return;
        }
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setPreviewUrl(data.pullRequest);
      setMessage("Website preview updated. The preview link appears on the pull request once Vercel has built it, in about two minutes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  // Each sentence once: when image checks block, theirs are listed under the image checks.
  const otherProblems = imageChecks?.enforced
    ? problems.filter(p => !imageChecks.report.problems.includes(p))
    : problems;

  const needImages = (!hasHero && !!heroPrompt) || (!hasOg && !!coverPrompt) || missingArticle.length > 0;
  const missingCount = (!hasHero && heroPrompt ? 1 : 0) + (!hasOg && coverPrompt ? 1 : 0) + missingArticle.length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Website</h3>
        <p className="text-xs text-gray-500">Sends this blog to agencymedicalmarketing.com as a pull request. It goes live when the pull request is merged.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={hasHero ? "text-green-700" : "text-gray-500"}>{hasHero ? "Hero image ready" : "No hero image yet"}</span>
        <span className={hasOg ? "text-green-700" : "text-gray-500"}>{hasOg ? "Share card ready" : "No share card yet"}</span>
        {articlePrompts.length > 0 && (
          <span className={missingArticle.length === 0 ? "text-green-700" : "text-gray-500"}>
            Article images {articlePrompts.length - missingArticle.length} of {articlePrompts.length}
          </span>
        )}
        {needImages && (
          <button onClick={makeImages} disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy === "images" ? `Making ${missingCount} image${missingCount === 1 ? "" : "s"}, about a minute each` : `Make the missing images (${missingCount})`}
          </button>
        )}
      </div>

      {prUrl ? (
        <p className="text-sm text-gray-700">
          Pull request opened: <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline">{prUrl}</a>. Merge it to put the post live.
        </p>
      ) : (
        <div className="space-y-3">
          {clusters.length > 0 && (<>
            <label className="block text-sm font-medium text-gray-700" htmlFor="cta-cluster">Which service does it point readers to?</label>
            <select id="cta-cluster" value={cluster} onChange={e => { setCluster(e.target.value); setPreview(null); }}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">Choose a service</option>
              {clusters.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </>)}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={openWebsitePreview} disabled={(clusters.length > 0 && !cluster) || busy !== null}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy === "website" ? "Opening the website preview" : previewUrl ? "Update the website preview" : "Open a website preview"}
            </button>
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 underline">Website preview</a>
            )}
          </div>
          {!isApproved && <p className="text-sm text-gray-500">Approve the blog to send it to the website.</p>}
        </div>
      )}
      {!prUrl && isApproved && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => send(true)} disabled={(clusters.length > 0 && !cluster) || busy !== null}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy === "preview" ? "Checking" : "Preview what will be sent"}
            </button>
            {preview && !preview.missing && (
              <button onClick={() => send(false)} disabled={busy !== null}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {busy === "send" ? "Opening the pull request" : "Send to the website"}
              </button>
            )}
          </div>
          {preview && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">Goes live at {preview.liveUrl} once merged. Files: {preview.files.map(f => f.path).join(", ")}</p>
              {preview.missing && <p className="text-sm text-amber-700">{preview.missing}</p>}
              <pre className="max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap">{preview.mdx}</pre>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {otherProblems.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-red-600">
          {otherProblems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {imageChecks && (() => {
        const failed = imageChecks.report.checks.filter(c => !c.passed);
        return (
          <div className="space-y-1 text-sm">
            <p className={failed.length === 0 ? "text-green-700" : imageChecks.enforced ? "text-red-600" : "text-amber-700"}>
              {failed.length === 0
                ? "Image checks passed."
                : imageChecks.enforced
                  ? `Image checks: ${failed.length} failed, and they block sending. Fix these in Blog images above.`
                  : `Image checks: ${failed.length} failed, shown, not yet blocking. Fix these in Blog images above.`}
            </p>
            {failed.length > 0 && (
              <ul className={`list-disc space-y-1 pl-5 ${imageChecks.enforced ? "text-red-600" : "text-amber-700"}`}>
                {failed.flatMap(c => c.problems).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}
          </div>
        );
      })()}
    </div>
  );
}
