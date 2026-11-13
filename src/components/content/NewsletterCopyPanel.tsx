"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  pieceId: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  imageUrl: string | null;
  isApproved: boolean;
  canMarkPublished: boolean;
  published: { by: string | null; at: string } | null;
}

/**
 * Copy-ready view of a LinkedIn newsletter article. Michael pastes each block
 * into LinkedIn's newsletter editor; the body is copied as rich text so
 * headings and paragraphs survive the paste.
 */
export default function NewsletterCopyPanel({ pieceId, title, bodyHtml, bodyText, imageUrl, isApproved, canMarkPublished, published }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flash = (key: string) => { setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 2000); };

  async function copyText(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); flash(key); } catch { setError("Copy was blocked by the browser. Select the text and copy it by hand."); }
  }

  async function copyRich(key: string, html: string, text: string) {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      flash(key);
    } catch { setError("Copy was blocked by the browser. Select the text and copy it by hand."); }
  }

  async function markPublished() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/publish/newsletter", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pieceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not mark as published");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not mark as published"); }
    finally { setBusy(false); }
  }

  const btn = "workspace-button workspace-button-secondary";
  const when = published ? new Date(published.at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "";

  return (
    <div className="workspace-panel space-y-5 p-5" data-testid="newsletter-copy-panel">
      <div>
        <h2 className="text-lg font-semibold">Publish to the LinkedIn newsletter</h2>
        <p className="text-sm text-gray-600">Paste each part into the newsletter editor on LinkedIn, then mark it as published here.</p>
      </div>

      {!isApproved && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Approve this article before publishing it.</p>}

      <section className="space-y-2" aria-label="Title">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Title</h3>
          <button type="button" className={btn} onClick={() => copyText("title", title)}>{copied === "title" ? "Copied" : "Copy title"}</button>
        </div>
        <p className="text-base font-medium">{title}</p>
      </section>

      <section className="space-y-2" aria-label="Body">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Body</h3>
          <button type="button" className={btn} onClick={() => copyRich("body", bodyHtml, bodyText)}>{copied === "body" ? "Copied" : "Copy body"}</button>
        </div>
        <div
          className="max-h-96 space-y-3 overflow-y-auto rounded-md border border-gray-200 p-4 text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline"
          // bodyHtml comes from markdownToNewsletterHtml, which escapes all raw HTML.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </section>

      <section className="space-y-2" aria-label="Image">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Image</h3>
          {imageUrl && (
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={() => copyText("image", imageUrl)}>{copied === "image" ? "Copied" : "Copy image link"}</button>
              <a className={btn} href={imageUrl} download target="_blank" rel="noreferrer">Download image</a>
            </div>
          )}
        </div>
        {imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imageUrl} alt="Newsletter cover" className="max-h-64 rounded-md border border-gray-200" />
          : <p className="text-sm text-gray-500">No image has been made for this article yet.</p>}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
        {published ? (
          <p className="text-sm font-medium text-green-700">Published{published.by ? ` by ${published.by}` : ""} on {when}</p>
        ) : canMarkPublished ? (
          <button type="button" className="workspace-button" disabled={busy || !isApproved} onClick={markPublished}>
            {busy ? "Saving..." : "Mark as published"}
          </button>
        ) : null}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
