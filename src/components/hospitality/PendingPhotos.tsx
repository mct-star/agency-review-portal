"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BankItem } from "@/components/admin/MediaBank";

/** Photos the team sent in, decided here with one tap each. */
export default function PendingPhotos({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/bank?companyId=${companyId}&kind=photo&status=pending`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => { if (live) setItems(d.data || []); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [companyId]);

  async function decide(item: BankItem, decision: "approve" | "reject") {
    if (decision === "reject" && !window.confirm("Remove this photo for good?")) return;
    setBusy(item.id);
    setError(null);
    const res = await fetch("/api/bank/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ids: [item.id], decision }) });
    setBusy(null);
    if (!res.ok) { setError("That did not work. Please try again."); return; }
    setItems((all) => (all || []).filter((i) => i.id !== item.id));
    router.refresh();
  }

  if (items === null) return <p className="text-sm text-gray-600">Loading photos</p>;
  if (items.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-base font-semibold text-amber-900">Photos from the team</h2>
      <p className="text-sm text-amber-900">Nothing goes on a post until you approve it.</p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.id} className="overflow-hidden rounded-lg border border-amber-200 bg-white">
            {it.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.thumb_url} alt={it.scene_label || ""} className="aspect-square w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-gray-100 text-sm text-gray-600">Preparing preview</div>
            )}
            <div className="flex gap-2 p-2">
              <button disabled={busy === it.id} onClick={() => decide(it, "approve")} className="min-h-[44px] flex-1 rounded-md bg-emerald-600 px-3 py-3 text-base font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
              <button disabled={busy === it.id} onClick={() => decide(it, "reject")} className="min-h-[44px] flex-1 rounded-md border border-red-200 px-3 py-3 text-base text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
