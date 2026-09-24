"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BankTile, type BankItem } from "@/components/admin/MediaBank";

/**
 * "Choose from bank" on a post: pick a real photo or clip from the bank
 * and it goes on the post. The LinkedIn preview and publish read it through
 * the same media rule, so it shows exactly as it will post.
 */
export default function BankPicker({ pieceId, companyId }: { pieceId: string; companyId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [kind, setKind] = useState<"all" | "photo" | "video">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function openPicker() {
    setOpen(true);
    setMessage(null);
    const res = await fetch(`/api/bank?companyId=${encodeURIComponent(companyId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error || "Could not load the bank"); setItems([]); return; }
    setItems(data.data || []);
  }

  async function use(item: BankItem) {
    setBusy(item.id);
    setMessage(null);
    const res = await fetch(`/api/bank/${item.id}/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentPieceId: pieceId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMessage(data.error || "Could not add it"); return; }
    setOpen(false);
    router.refresh();
  }

  const shown = (items || []).filter((i) => kind === "all" || i.kind === kind);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Real photo or video</h3>
          <p className="text-xs text-gray-500">Put a photo or clip from the bank on this post.</p>
        </div>
        <button onClick={openPicker} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700">Choose from bank</button>
      </div>
      {message && !open && <p className="mt-2 text-xs text-red-600">{message}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2 text-sm">
                {(["all", "photo", "video"] as const).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-700"}`}>
                    {k === "all" ? "All" : k === "photo" ? "Photos" : "Videos"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <a href="/admin/bank" className="text-violet-700 hover:underline">Open the bank</a>
                <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-800">Close</button>
              </div>
            </div>
            {message && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{message}</p>}
            {items === null ? <p className="text-sm text-gray-500">Loading...</p> : shown.length === 0 ? (
              <p className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">The bank is empty. Add photos and clips in the Photo &amp; Video Bank.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {shown.map((it) => (
                  <BankTile key={it.id} item={it} onClick={() => !busy && use(it)} badge={busy === it.id ? "Adding..." : undefined} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
