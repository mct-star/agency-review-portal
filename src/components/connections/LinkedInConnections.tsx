"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Account = { id: string; accountName: string; usable: boolean; expiresAt: string | null; kind?: "personal" | "company_page"; active?: boolean; isDefault?: boolean };

/** Shows actual LinkedIn account readiness independently of the publishing destination selection. */
export default function LinkedInConnections({ companyId, canConnect, canManagePages = false }: { companyId: string; canConnect: boolean; canManagePages?: boolean }) {
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [configured, setConfigured] = useState(false);
  const [pagesSupported, setPagesSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/publish/linkedin-direct?companyId=${encodeURIComponent(companyId)}&includeInactive=1`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error("Could not load LinkedIn connections. Try again.");
      if (!signal?.aborted) { setAccounts(data.accounts || []); setConfigured(!!data.configured); setPagesSupported(!!data.companyPagesSupported); }
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
  async function pageAction(account: Account, action: "set_default" | "switch_on" | "switch_off") {
    if (action === "set_default" && !window.confirm(`Make ${account.accountName} the default LinkedIn page? Company page posts will go to it.`)) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/publish/linkedin-direct", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, socialAccountId: account.id, action }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error || "Could not change this LinkedIn page. Try again."); }
      setNotice(action === "set_default" ? `${account.accountName} is now the default page.` : action === "switch_on" ? `${account.accountName} is switched on.` : `${account.accountName} is switched off.`);
      await refresh();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not change this LinkedIn page."); }
    finally { setBusy(false); }
  }
  const activePages = accounts.filter((account) => account.kind === "company_page" && account.active !== false);
  const noDefault = activePages.length > 1 && !activePages.some((account) => account.isDefault);
  return <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
    <h3 className="text-sm font-semibold text-gray-900">LinkedIn</h3>
    <p className="text-sm text-gray-600">{pagesSupported
      ? "Connect LinkedIn to publish approved posts. Signing in connects your personal profile and every LinkedIn page you administer. Company page posts go to the default page only. Choosing any other page needs a separate confirmation when you publish, and a page you disconnect or switch off stays off when you reconnect. Switch it on here."
      : "Connect a personal profile to publish approved posts. Company page publishing is not available here yet."}</p>
    {params.has("linkedin_error") && <p role="status" className="text-sm text-red-700">LinkedIn did not connect. Start again. Your saved accounts have been kept.</p>}
    {params.has("linkedin_connected") && <p role="status" className="text-sm text-green-700">LinkedIn connected.</p>}
    {params.has("linkedin_pages_error") && <p role="status" className="text-sm text-amber-800">Your personal profile is connected, but your LinkedIn pages could not be loaded. Connect again to retry.</p>}
    {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
    {noDefault && <p role="status" className="text-sm text-amber-800">No default page is set. Company page posts will not be queued automatically until you make one page the default.</p>}
    {loading ? <p className="text-sm text-gray-600">Loading LinkedIn connections...</p> : error ? <div role="alert"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => void refresh()} className="min-h-11 text-sm text-blue-700 underline">Try again</button></div> : <>
      {accounts.length === 0 ? <p className="text-sm text-gray-600">Not connected</p> : <ul className="space-y-2">{accounts.map((account) => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-100 px-3 py-2 text-sm"><div><p className="font-medium text-gray-900">{account.accountName}</p><p className="text-xs text-gray-600">{account.kind === "company_page" ? (account.isDefault ? "Company page, default page" : "Company page") : "Personal profile"}</p><p className={account.active === false ? "text-gray-600" : account.usable ? "text-green-700" : "text-amber-800"}>{account.active === false ? "Switched off" : account.usable ? "Connected" : "Reconnect needed"}</p></div>{canConnect && <div className="flex flex-wrap gap-3">{canManagePages && account.kind === "company_page" && account.active !== false && !account.isDefault && <button type="button" onClick={() => void pageAction(account, "set_default")} disabled={busy} className="min-h-11 text-xs text-violet-700 underline disabled:opacity-50">Make {account.accountName} the default page</button>}{canManagePages && account.kind === "company_page" && account.active === false && <button type="button" onClick={() => void pageAction(account, "switch_on")} disabled={busy} className="min-h-11 text-xs text-violet-700 underline disabled:opacity-50">Switch on {account.accountName}</button>}{canManagePages && account.kind === "company_page" && account.active !== false && !account.isDefault && <button type="button" onClick={() => void pageAction(account, "switch_off")} disabled={busy} className="min-h-11 text-xs text-gray-700 underline disabled:opacity-50">Switch off {account.accountName}</button>}{account.active !== false && <button type="button" onClick={() => void disconnect(account)} disabled={busy} className="min-h-11 text-xs text-red-700 underline disabled:opacity-50">Disconnect {account.accountName}</button>}</div>}</li>)}</ul>}
      {!canConnect ? <p className="text-sm text-gray-600">Ask your AGENCY contact to connect LinkedIn for you.</p> : !configured ? <p className="text-sm text-amber-800">LinkedIn connection setup is still required. Contact your AGENCY contact.</p> : <a href={`/api/auth/linkedin?companyId=${encodeURIComponent(companyId)}&returnTo=setup`} className="inline-flex min-h-11 items-center rounded-md bg-sky-700 px-4 text-sm font-semibold text-white">{accounts.some((account) => !account.usable) ? "Reconnect LinkedIn" : "Connect LinkedIn"}</a>}
    </>}
  </section>;
}
