"use client";

import { useState } from "react";
import type { BlogImagesPayload } from "@/lib/publishing/blog-images";
import type { GateImage } from "@/lib/publishing/blog-gate-input";
import { BLOG_IMAGE_TYPES } from "@/lib/publishing/blog-image-record";
import { shareFileProblem, shareUploadError } from "@/lib/publishing/share-image";

/**
 * The image record on a blog piece (15 Nov 2026): what each image is and
 * the passage it serves, the share image upload, and the image checks'
 * verdict. Shown to every user who can see the piece; the routes under
 * /api/content/[pieceId]/blog-images do the saving.
 */

interface Draft { type: string; passage: string; treatment: string; alt: string }

const draftFor = (image: GateImage): Draft => ({
  type: typeof image.record?.type === "string" ? image.record.type : "",
  passage: image.record?.passage || "",
  treatment: typeof image.record?.treatment === "string" ? image.record.treatment : "",
  alt: image.record?.alt || "",
});

const sentence = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
const inputClass = "block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

export default function BlogImageRecordPanel({ pieceId, initial }: { pieceId: string; initial: BlogImagesPayload }) {
  const [data, setData] = useState<BlogImagesPayload>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(initial.images.map(i => [i.id, draftFor(i)])));
  const [rowState, setRowState] = useState<Record<string, { busy?: boolean; saved?: boolean; error?: string }>>({});
  const [upload, setUpload] = useState<{ busy?: boolean; error?: string; done?: boolean }>({});

  const url = `/api/content/${encodeURIComponent(pieceId)}/blog-images`;

  function applyPayload(next: BlogImagesPayload, keepDraftsFor?: string) {
    setData(next);
    setDrafts(prev => Object.fromEntries(next.images.map(i => [i.id, i.id !== keepDraftsFor && prev[i.id] ? prev[i.id] : draftFor(i)])));
  }

  async function save(image: GateImage) {
    const draft = drafts[image.id];
    setRowState(s => ({ ...s, [image.id]: { busy: true } }));
    try {
      const record = image.role === "share"
        ? { passage: draft.passage }
        : { type: draft.type || null, passage: draft.passage, treatment: draft.treatment, alt: draft.alt };
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: image.id, record }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The record could not be saved.");
      applyPayload(body as BlogImagesPayload, image.id);
      setRowState(s => ({ ...s, [image.id]: { saved: true } }));
    } catch (e) {
      setRowState(s => ({ ...s, [image.id]: { error: e instanceof Error ? e.message : "The record could not be saved." } }));
    }
  }

  async function uploadShare(file: File) {
    const problem = shareFileProblem(file);
    if (problem) { setUpload({ error: problem }); return; }
    setUpload({ busy: true });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(url, { method: "POST", body: form });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok || !body || typeof body !== "object") throw new Error(shareUploadError(res.status, body));
      applyPayload(body as BlogImagesPayload);
      setUpload({ done: true });
    } catch (e) {
      setUpload({ error: e instanceof Error ? e.message : "The share image could not be uploaded." });
    }
  }

  const share = data.images.find(i => i.role === "share");
  const wantedTreatment = data.settings.photographTreatment;
  const edit = (id: string, field: keyof Draft, value: string) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [field]: value } }));
    setRowState(s => ({ ...s, [id]: {} }));
  };

  return (
    <div className="workspace-panel space-y-5 p-5 sm:p-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Blog images</h3>
        <p className="text-xs text-gray-500">Say what each image is and the passage it serves. The checks below read these records.</p>
      </div>

      {data.images.length === 0 && <p className="text-sm text-gray-500">This blog has no hero, inline or share image yet.</p>}

      <ul className="space-y-4">
        {data.images.map(image => {
          const draft = drafts[image.id] || draftFor(image);
          const state = rowState[image.id] || {};
          const editorial = image.role !== "share";
          return (
            <li key={image.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                {image.publicUrl && <img src={image.publicUrl} alt="" className="h-24 w-32 shrink-0 rounded border border-gray-200 object-cover" />}
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-sm font-medium text-gray-900">{sentence(image.label)}</p>
                  {editorial && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700" htmlFor={`type-${image.id}`}>Type</label>
                      <select id={`type-${image.id}`} value={draft.type} onChange={e => edit(image.id, "type", e.target.value)} className={inputClass}>
                        <option value="">Choose a type</option>
                        {BLOG_IMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700" htmlFor={`passage-${image.id}`}>The passage this image serves</label>
                    <input id={`passage-${image.id}`} type="text" maxLength={300} value={draft.passage} onChange={e => edit(image.id, "passage", e.target.value)} className={inputClass} />
                  </div>
                  {editorial && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700" htmlFor={`treatment-${image.id}`}>Treatment</label>
                      <input id={`treatment-${image.id}`} type="text" maxLength={60} value={draft.treatment}
                        placeholder={wantedTreatment && draft.type === "photograph" ? wantedTreatment : ""}
                        onChange={e => edit(image.id, "treatment", e.target.value)} className={inputClass} />
                      {wantedTreatment && draft.type === "photograph" && (
                        <p className="mt-1 text-xs text-gray-500">A photograph needs the &ldquo;{wantedTreatment}&rdquo; treatment.</p>
                      )}
                    </div>
                  )}
                  {editorial && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700" htmlFor={`alt-${image.id}`}>
                        Alt text{image.role === "inline" && <span className="text-red-600"> (required)</span>}
                      </label>
                      <input id={`alt-${image.id}`} type="text" maxLength={300} value={draft.alt} onChange={e => edit(image.id, "alt", e.target.value)} className={inputClass} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => save(image)} disabled={state.busy}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {state.busy ? "Saving" : "Save"}
                    </button>
                    {state.saved && <span className="text-sm text-green-700">Saved</span>}
                    {state.error && <span className="text-sm text-red-600">{state.error}</span>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {data.unplaced.map(u => (
        <p key={u.id} className="text-sm text-gray-600">
          {sentence(u.label)} has no [[image: {u.n}]] line in the text, so it will not be published and is not checked.
        </p>
      ))}
      {data.legacyCover && (
        <p className="text-sm text-gray-600">
          The older share picture made from the cover prompt is not checked as the share image. Upload a designed share card below.
        </p>
      )}

      <div className="space-y-2 border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-900">Share image</h4>
        <p className="text-xs text-gray-500">
          The portal does not make the share card yet, so upload it here for now: a designed image 1200 by 630, not the hero.
        </p>
        {share && (
          <p className="text-sm text-gray-700">
            {share.width && share.height ? `Uploaded, measured at ${share.width} by ${share.height}.` : "Uploaded, but its size could not be measured."}
          </p>
        )}
        <label className="block text-xs font-medium text-gray-700" htmlFor={`share-${pieceId}`}>
          {share ? "Replace the share image" : "Upload the share image"} (PNG, JPEG or WebP, up to 4 MB)
        </label>
        <input id={`share-${pieceId}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={upload.busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) void uploadShare(f); e.target.value = ""; }}
          className="block text-sm text-gray-700" />
        {upload.busy && <p className="text-sm text-gray-500">Uploading</p>}
        {upload.done && <p className="text-sm text-green-700">Share image uploaded.</p>}
        {upload.error && <p className="text-sm text-red-600">{upload.error}</p>}
      </div>

      <div className="space-y-2 border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-900">Image checks</h4>
        {!data.settings.enforceImageChecks && (
          <p className="text-xs text-gray-500">These checks are shown here but do not yet block publishing for this company.</p>
        )}
        <ul className="space-y-2">
          {data.report.checks.map(check => {
            const status = !check.required ? "Not required" : check.passed ? "Passed" : "Failed";
            const colour = !check.required ? "text-gray-500" : check.passed ? "text-green-700" : "text-red-600";
            return (
              <li key={check.code} className="text-sm">
                <span className="text-gray-900">{check.label}: </span>
                <span className={colour}>{status}</span>
                {check.required && !check.passed && (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-600">
                    {check.problems.map(p => <li key={p}>{p}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
