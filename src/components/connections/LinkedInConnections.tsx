"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Account = { id: string; accountName: string; usable: boolean; expiresAt: string | null };

/** Shows actual LinkedIn account readiness independently of the publishing destination selection. */
export default function LinkedInConnections({ companyId, canConnect }: { companyId: string; canConnect: boolean }) {
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/publish/linkedin-direct?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error("Could not load LinkedIn connections. Try again.");
      if (!signal?.aborted) { setAccounts(data.accounts || []); setConfigured(!!data.configured); }
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not load LinkedIn connections."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [companyId]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  async function disconnect(account: Account) {
    if (!window.confirm(`Disconnect ${account.accountName} from this company?`)) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/publish/linkedin-direct", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, socialAccountId: account.id }) });
      if (!response.ok) throw new Error("Could not disconnect this LinkedIn account. Try again.");
      setNotice("LinkedIn account disconnected."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect this account."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
    <h3 className="text-sm font-semibold text-gray-900">LinkedIn</h3>
    <p className="text-sm text-gray-600">Connect a personal profile to publish approved posts. Company Page publishing is not available here yet.</p>
    {params.has("linkedin_error") && <p role="status" className="text-sm text-red-700">LinkedIn did not connect. Start again. Your saved accounts have been kept.</p>}
    {params.has("linkedin_connected") && <p role="status" className="text-sm text-green-700">LinkedIn connected.</p>}
    {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
    {loading ? <p className="text-sm text-gray-600">Loading LinkedIn connections...</p> : error ? <div role="alert"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => void refresh()} className="min-h-11 text-sm text-blue-700 underline">Try again</button></div> : <>
      {accounts.length === 0 ? <p className="text-sm text-gray-600">Not connected</p> : <ul className="space-y-2">{accounts.map((account) => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-100 px-3 py-2 text-sm"><div><p className="font-medium text-gray-900">{account.accountName}</p><p className={account.usable ? "text-green-700" : "text-amber-800"}>{account.usable ? "Connected" : "Reconnect needed"}</p></div>{canConnect && <button type="button" onClick={() => void disconnect(account)} disabled={busy} className="min-h-11 text-xs text-red-700 underline disabled:opacity-50">Disconnect {account.accountName}</button>}</li>)}</ul>}
      {!canConnect ? <p className="text-sm text-gray-600">Your administrator manages LinkedIn connections.</p> : !configured ? <p className="text-sm text-amber-800">LinkedIn connection setup is still required. Contact your platform administrator.</p> : <a href={`/api/auth/linkedin?companyId=${encodeURIComponent(companyId)}&returnTo=setup`} className="inline-flex min-h-11 items-center rounded-md bg-sky-700 px-4 text-sm font-semibold text-white">{accounts.some((account) => !account.usable) ? "Reconnect LinkedIn" : "Connect LinkedIn"}</a>}
    </>}
  </section>;
}
