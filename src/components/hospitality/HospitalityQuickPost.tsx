"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HOSPITALITY_POST_TYPES } from "@/lib/constants/post-types";
import type { BankItem } from "@/components/admin/MediaBank";
import PhotoSuggestions, { type Suggestion } from "./PhotoSuggestions";

const TYPES = HOSPITALITY_POST_TYPES.filter((t) => t.slug !== "weather_of_the_day");

interface Result {
  pieceId: string;
  date: string;
  time: string;
  body: string;
  warnings: string[];
  imageUrls: string[];
  imageNote: string | null;
}

/** The next sensible slot by the browser's clock: lunch, evening, or tomorrow lunch. */
function suggestedSlot(now = new Date()): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 11 * 60 + 30) return { date: ymd(now), time: "12:00" };
  if (minutes < 17 * 60 + 30) return { date: ymd(now), time: "18:00" };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: ymd(tomorrow), time: "12:00" };
}

/**
 * One post for the venue: pick the kind, say what it is, choose the photo and
 * when it goes out, get a draft and approve it.
 */
export default function HospitalityQuickPost({ companyId }: { companyId: string }) {
  const [slug, setSlug] = useState(TYPES[0].slug);
  const [brief, setBrief] = useState("");
  const [slot, setSlot] = useState(() => suggestedSlot());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [library, setLibrary] = useState<BankItem[] | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [chosen, setChosen] = useState<BankItem | null>(null);
  const type = TYPES.find((t) => t.slug === slug)!;

  useEffect(() => {
    if (!libraryOpen || library !== null) return;
    fetch(`/api/bank?companyId=${companyId}&kind=photo`)
      .then(async (res) => (res.ok ? ((await res.json()).data as BankItem[]) || [] : []))
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, [libraryOpen, library, companyId]);

  async function write(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(null);
    const res = await fetch("/api/hospitality/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, postTypeSlug: slug, brief, imageId: chosen?.id, date: slot.date, time: slot.time }),
    });
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
    setSaved(decision === "approve" ? "Approved. It is in this week's posts, ready to download with the rest." : "Thrown away.");
    if (decision === "discard") setResult(null);
  }

  const whenLabel = (() => {
    try {
      const d = new Date(`${slot.date}T${slot.time}:00`);
      return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${slot.time}`;
    } catch {
      return `${slot.date} at ${slot.time}`;
    }
  })();

  return (
    <div className="grid max-w-5xl gap-8 lg:grid-cols-2">
      <form onSubmit={write} className="space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-gray-900">What kind of post</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.slug} className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border p-3 ${slug === t.slug ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-white"}`}>
                <input type="radio" name="type" value={t.slug} checked={slug === t.slug} onChange={() => setSlug(t.slug)} className="sr-only" />
                <span className="block text-sm font-medium text-gray-900">{t.label}</span>
                <span className="block text-xs text-gray-600">{t.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="font-medium text-gray-900">What do you want to say</span>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} required placeholder={type.briefHint} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-3 text-base" />
          <span className="mt-1 block text-xs text-gray-500">Prices, times and dates in the post come only from what you write here.</span>
        </label>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-medium text-gray-900">The photo</p>
          {chosen ? (
            <div className="mt-2 flex items-center gap-3">
              {chosen.thumb_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={chosen.thumb_url} alt="" className="h-16 w-16 rounded-md object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-md bg-gray-100" aria-hidden="true" />
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setLibraryOpen(true)} className="min-h-11 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50">Change photo</button>
                <button type="button" onClick={() => setChosen(null)} className="min-h-11 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50">Let us pick</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <PhotoSuggestions
                companyId={companyId}
                postType={slug}
                onPick={(s: Suggestion) => setChosen({ id: s.id, thumb_url: s.thumbUrl, scene_label: s.label, original_filename: null } as BankItem)}
              />
              <button type="button" onClick={() => setLibraryOpen(true)} className="min-h-11 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50">Choose from the whole library</button>
              <p className="text-xs text-gray-500">If you do not choose, we use the best match.</p>
            </div>
          )}
          {libraryOpen && (
            <div className="mt-3">
              {library === null ? (
                <p className="text-sm text-gray-500">Loading photos</p>
              ) : library.length === 0 ? (
                <p className="text-sm text-gray-600">No photos in the library yet. <Link href="/library" className="underline">Add some from the Photo and Video Library.</Link></p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {library.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => { setChosen(item); setLibraryOpen(false); }} className={`block aspect-square w-full overflow-hidden rounded-md border-2 ${chosen?.id === item.id ? "border-violet-500" : "border-transparent"}`} aria-label={item.scene_label || item.original_filename || "Photo"}>
                        {item.thumb_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumb_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="block h-full w-full bg-gray-100" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setLibraryOpen(false)} className="mt-2 min-h-11 text-sm text-gray-600 underline">Close</button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-medium text-gray-900">When it goes out</p>
          <p className="mt-1 text-sm text-gray-600">{whenLabel}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="sr-only">Date</span>
              <input type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} className="min-h-11 rounded-md border border-gray-300 px-3 text-base" />
            </label>
            <label className="text-sm">
              <span className="sr-only">Time</span>
              <input type="time" value={slot.time} onChange={(e) => setSlot({ ...slot, time: e.target.value })} className="min-h-11 rounded-md border border-gray-300 px-3 text-base" />
            </label>
          </div>
        </div>

        <button disabled={busy || !brief.trim()} className="min-h-11 w-full rounded-md bg-violet-600 px-5 py-2.5 text-base font-medium text-white hover:bg-violet-700 disabled:opacity-50 sm:w-auto">
          {busy && !result ? "Writing..." : "Write the post"}
        </button>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      </form>

      <div>
        {result && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            {result.imageUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.imageUrls[0]} alt="The photo for this post" className="max-h-72 w-full rounded-md object-cover" />
            ) : (
              <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.imageNote || "No photo yet."} You can choose one above and write again, or add one on Waiting for you.</p>
            )}
            {result.warnings.map((w) => <p key={w} className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}
            <label className="block text-sm">
              <span className="sr-only">The post</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} disabled={!!saved?.startsWith("Approved")} className="w-full rounded-md border border-gray-300 px-3 py-3 text-base" />
            </label>
            {saved ? (
              <p className="text-sm text-emerald-700" role="status">{saved} <Link href="/approvals" className="underline">See everything waiting</Link></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => decide("approve")} className="min-h-11 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                <Link href="/approvals" className="inline-flex min-h-11 items-center rounded-md border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50">Decide later</Link>
                <button disabled={busy} onClick={() => decide("discard")} className="min-h-11 rounded-md border border-red-200 px-4 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">Throw it away</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
