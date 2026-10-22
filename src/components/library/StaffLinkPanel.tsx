"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The link staff use to add photos from their own phones: no login, photos
 * only, and nothing they send can go on a post until a company user approves
 * it. Turn it on, copy it, or replace it (the old address stops working at once).
 */
export default function StaffLinkPanel({ companyId }: { companyId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/company/staff-link?companyId=${encodeURIComponent(companyId)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setEnabled(!!data.enabled); setUrl(data.url ?? null); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function act(action: "enable" | "disable" | "rotate") {
    if (action === "rotate" && !window.confirm("Replace the link? Anyone using the old one will need the new one.")) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/company/staff-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, action }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMessage(data.error || "That did not work"); return; }
    setEnabled(!!data.enabled);
    setUrl(data.url ?? null);
    setMessage(action === "rotate" ? "New link ready. The old one no longer works." : action === "enable" ? "The link is on." : "The link is off.");
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setMessage("Copied.");
  }

  return (
    <details className="rounded-lg border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-gray-900">Let your team add photos from their phones</summary>
      <div className="mt-3 space-y-3 text-sm text-gray-700">
        <p>Share one link. Staff open it, pick photos, and send. No login. You approve each photo before it can be used on a post.</p>
        {enabled && url ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={url} aria-label="Team photo link" onFocus={(e) => e.currentTarget.select()} className="min-w-[240px] flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs" />
              <button onClick={copy} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700">Copy</button>
            </div>
            <div className="flex gap-3 text-xs">
              <button disabled={busy} onClick={() => act("rotate")} className="text-violet-700 hover:underline disabled:opacity-50">Replace the link</button>
              <button disabled={busy} onClick={() => act("disable")} className="text-gray-600 hover:underline disabled:opacity-50">Turn it off</button>
            </div>
          </>
        ) : (
          <button disabled={busy} onClick={() => act("enable")} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">Turn on the team link</button>
        )}
        {message && <p className="text-xs text-emerald-700" role="status">{message}</p>}
      </div>
    </details>
  );
}
