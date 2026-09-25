"use client";

import { useState } from "react";
import { CTA_CLUSTERS } from "@/lib/publishing/website-blog";

/**
 * A blog's route to agencymedicalmarketing.com (25 Sept 2026): make the
 * hero and share images from the writer's own prompts, preview exactly
 * what will be sent, then open a pull request on the website. Merging that
 * pull request is what puts it live. Admin only; the page decides.
 */
export default function WebsitePublishPanel({
  pieceId, companyId, isApproved, heroPrompt, coverPrompt, hasHero, hasOg,
}: {
  pieceId: string;
  companyId: string;
  isApproved: boolean;
  heroPrompt: string | null;
  coverPrompt: string | null;
  hasHero: boolean;
  hasOg: boolean;
}) {
  const [cluster, setCluster] = useState("");
  const [busy, setBusy] = useState<null | "images" | "preview" | "send">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ files: { path: string }[]; mdx: string; liveUrl: string; missing?: string } | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  async function makeImages() {
    const prompts = [
      ...(!hasHero && heroPrompt ? [{ prompt: heroPrompt, style: "hero_image_prompt", aspectRatio: "4:3" }] : []),
      ...(!hasOg && coverPrompt ? [{ prompt: coverPrompt, style: "cover_image_prompt", aspectRatio: "16:9" }] : []),
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
    setBusy(dryRun ? "preview" : "send"); setError(null); setMessage(null);
    try {
      const res = await fetch("/api/publish/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, ctaCluster: cluster, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (dryRun) setPreview(data);
      else { setPrUrl(data.pullRequest); setPreview(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const needImages = (!hasHero && !!heroPrompt) || (!hasOg && !!coverPrompt);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Website</h3>
        <p className="text-xs text-gray-500">Sends this blog to agencymedicalmarketing.com as a pull request. It goes live when the pull request is merged.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={hasHero ? "text-green-700" : "text-gray-500"}>{hasHero ? "Hero image ready" : "No hero image yet"}</span>
        <span className={hasOg ? "text-green-700" : "text-gray-500"}>{hasOg ? "Share card ready" : "No share card yet"}</span>
        {needImages && (
          <button onClick={makeImages} disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy === "images" ? "Making images, about a minute" : "Make the hero and share images"}
          </button>
        )}
      </div>

      {prUrl ? (
        <p className="text-sm text-gray-700">
          Pull request opened: <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline">{prUrl}</a>. Merge it to put the post live.
        </p>
      ) : !isApproved ? (
        <p className="text-sm text-gray-500">Approve the blog to send it to the website.</p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700" htmlFor="cta-cluster">Which service does it point readers to?</label>
          <select id="cta-cluster" value={cluster} onChange={e => { setCluster(e.target.value); setPreview(null); }}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="">Choose a service</option>
            {CTA_CLUSTERS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={() => send(true)} disabled={!cluster || busy !== null}
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
    </div>
  );
}
