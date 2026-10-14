"use client";

import Link from "next/link";
import { useState } from "react";
import { HOSPITALITY_POST_TYPES } from "@/lib/constants/post-types";

const TYPES = HOSPITALITY_POST_TYPES.filter((t) => t.slug !== "weather_of_the_day");

interface Result {
  pieceId: string;
  body: string;
  warnings: string[];
  imageUrls: string[];
  imageNote: string | null;
}

/** One post for the venue: pick the kind, say what it is, get a draft and a photo. */
export default function HospitalityQuickPost({ companyId }: { companyId: string }) {
  const [slug, setSlug] = useState(TYPES[0].slug);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const type = TYPES.find((t) => t.slug === slug)!;

  async function write(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(null);
    const res = await fetch("/api/hospitality/quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, postTypeSlug: slug, brief }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Something went wrong. Please try again."); return; }
    setResult(data);
    setText(data.body);
  }

  async function decide(decision: "approve" | "discard") {
    if (!result) return;
    setBusy(true);
    // Save any edits first, so what is approved is what is on screen.
    if (decision === "approve" && text !== result.body) {
      const patch = await fetch(`/api/hospitality/pieces/${result.pieceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      if (!patch.ok) { setBusy(false); setError("Your edit did not save. Please try again."); return; }
    }
    const res = await fetch(`/api/hospitality/pieces/${result.pieceId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    setBusy(false);
    if (!res.ok) { setError("That did not work. Please try again."); return; }
    setSaved(decision === "approve" ? "Approved. It is ready to export with the rest of the week." : "Thrown away.");
    if (decision === "discard") setResult(null);
  }

  return (
    <div className="grid max-w-5xl gap-8 lg:grid-cols-2">
      <form onSubmit={write} className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-gray-900">What kind of post</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.slug} className={`cursor-pointer rounded-lg border p-3 ${slug === t.slug ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-white"}`}>
                <input type="radio" name="type" value={t.slug} checked={slug === t.slug} onChange={() => setSlug(t.slug)} className="sr-only" />
                <span className="block text-sm font-medium text-gray-900">{t.label}</span>
                <span className="block text-xs text-gray-600">{t.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="font-medium text-gray-900">What do you want to say</span>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} required placeholder={type.briefHint} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          <span className="mt-1 block text-xs text-gray-500">Prices, times and dates in the post come only from what you write here.</span>
        </label>
        <button disabled={busy || !brief.trim()} className="rounded-md bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {busy && !result ? "Writing..." : "Write the post"}
        </button>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      </form>

      <div>
        {result && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            {result.imageUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.imageUrls[0]} alt="The photo chosen from your library" className="max-h-72 w-full rounded-md object-cover" />
            ) : (
              <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.imageNote || "No photo yet."} You can add one on the approvals page.</p>
            )}
            {result.warnings.map((w) => <p key={w} className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}
            <label className="block text-sm">
              <span className="sr-only">The post</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} disabled={!!saved?.startsWith("Approved")} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            {saved ? (
              <p className="text-sm text-emerald-700" role="status">{saved} <Link href="/approvals" className="underline">See everything waiting</Link></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => decide("approve")} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                <Link href="/approvals" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Decide later</Link>
                <button disabled={busy} onClick={() => decide("discard")} className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">Throw it away</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
