"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BankTile, type BankItem } from "@/components/admin/MediaBank";

export interface DraftPiece {
  id: string;
  title: string;
  post_type: string | null;
  typeLabel: string;
  body: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  auto_source: string | null;
  imageUrl: string | null;
  warnings: string[];
  whenLabel: string;
}

/** Marks the photo list as still loading, so an empty library reads differently. */
const LOADING = "loading" as const;

const SOURCE_TEXT: Record<string, string> = {
  weather_job: "Drafted for you from today's forecast",
  weekly_interview: "From your weekly chat",
  quick_post: "Written from your note",
};

/** One draft: see it as it will post, change the words or the photo, then one tap. */
export default function ApprovalCard({ piece, companyId }: { piece: DraftPiece; companyId: string }) {
  const router = useRouter();
  const [text, setText] = useState(piece.body);
  const [image, setImage] = useState(piece.imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<BankItem[] | typeof LOADING | null>(null);
  const [gone, setGone] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    if (text !== piece.body) {
      const patch = await fetch(`/api/hospitality/pieces/${piece.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      if (!patch.ok) { setBusy(false); setError("Your edit did not save. Please try again."); return; }
    }
    const res = await fetch(`/api/hospitality/pieces/${piece.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "approve" }) });
    setBusy(false);
    if (!res.ok) { setError("That did not work. Please try again."); return; }
    setGone("Approved");
    router.refresh();
  }

  async function discard() {
    if (!window.confirm("Throw this post away?")) return;
    setBusy(true);
    const res = await fetch(`/api/hospitality/pieces/${piece.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "discard" }) });
    setBusy(false);
    if (!res.ok) { setError("That did not work. Please try again."); return; }
    setGone("Thrown away");
    router.refresh();
  }

  async function openPicker() {
    setPicker(LOADING);
    const res = await fetch(`/api/bank?companyId=${companyId}&kind=photo`);
    const data = await res.json().catch(() => ({}));
    setPicker(res.ok ? data.data || [] : []);
  }

  async function choose(item: BankItem) {
    setBusy(true);
    const res = await fetch(`/api/hospitality/pieces/${piece.id}/photo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Could not change the photo"); return; }
    setImage(data.publicUrl);
    setPicker(null);
  }

  if (gone) return <li className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">{piece.typeLabel} for {piece.whenLabel}: {gone.toLowerCase()}.</li>;

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <span className="font-medium text-gray-900">{piece.typeLabel}, {piece.whenLabel}</span>
        {piece.auto_source && <span>{SOURCE_TEXT[piece.auto_source] || "Drafted for you"}</span>}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[180px_1fr]">
        <div>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="aspect-square w-full rounded-md object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-md bg-amber-50 px-2 text-center text-xs text-amber-900">No photo yet. Instagram needs one.</div>
          )}
          <button onClick={openPicker} className="mt-2 min-h-[44px] w-full rounded-md border border-gray-300 px-2 py-3 text-base text-gray-700 hover:bg-gray-50">{image ? "Change the photo" : "Choose a photo"}</button>
        </div>
        <div className="space-y-2">
          {piece.warnings.map((w) => <p key={w} className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">{w}</p>)}
          <label className="block"><span className="sr-only">The post</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={approve} className="min-h-[44px] rounded-md bg-emerald-600 px-4 py-3 text-base font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
            <button disabled={busy} onClick={discard} className="min-h-[44px] rounded-md border border-red-200 px-4 py-3 text-base text-red-700 hover:bg-red-50 disabled:opacity-50">Throw it away</button>
          </div>
        </div>
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPicker(null)} role="dialog" aria-modal="true" aria-label="Choose a photo">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Choose a photo from your library</h3>
              <button onClick={() => setPicker(null)} className="min-h-[44px] px-3 text-base text-gray-600 hover:text-gray-800">Close</button>
            </div>
            {picker === LOADING ? <p className="p-8 text-center text-sm text-gray-600">Loading photos</p> : picker.length === 0 ? <p className="p-8 text-center text-sm text-gray-600">No photos in the library yet. Add some from the Photo and Video Library.</p> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(picker as BankItem[]).map((it) => <BankTile key={it.id} item={it} onClick={() => !busy && choose(it)} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
