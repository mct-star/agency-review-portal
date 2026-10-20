"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { groupMetaConnections, type MetaConnectionAccount } from "@/lib/connections/state";

type Piece = { id: string; title?: string | null };
type Account = MetaConnectionAccount;
type PageChoice = { id: string; name: string; instagram: { id: string; username: string | null } | null };
type Job = { id: string; status: string; target_platform: string; scheduled_for: string | null; external_url: string | null; error_message: string | null; needs_checking?: boolean; response_payload?: { outcome_uncertain?: boolean } | null; content_piece?: { title: string | null }; social_account?: { account_name: string | null } };

/** Lets an authorised company user choose a precise Meta destination, publish approved posts and withdraw a saved connection. */
export default function MetaPublishingPanel({ companyId, canPublish, pieces = [], onQueued, onConnectionChanged, mode = "publish" }: { companyId: string; canPublish: boolean; pieces?: Piece[]; onQueued?: () => void; onConnectionChanged?: () => void; mode?: "publish" | "manage" }) {
  const managing = mode === "manage";
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pages, setPages] = useState<PageChoice[]>([]);
  const [pageId, setPageId] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [pieceId, setPieceId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [pagesError, setPagesError] = useState("");
  const [pagesLoading, setPagesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [timeZone, setTimeZone] = useState("your device time zone");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!companyId || !canPublish) return;
    const responses = await Promise.allSettled([
      fetch("/api/publish/meta?companyId=" + encodeURIComponent(companyId), { cache: "no-store", signal }),
      ...(managing ? [] : [fetch("/api/publish/jobs?companyId=" + encodeURIComponent(companyId) + "&limit=50", { cache: "no-store", signal })]),
    ]);
    if (signal?.aborted) return;
    const accountResponse = responses[0];
    if (accountResponse.status === "rejected") throw new Error("Could not load Facebook and Instagram connections. Try again.");
    const accountData = await accountResponse.value.json();
    if (!accountResponse.value.ok) throw new Error(accountData.error || "Could not load connections.");
    if (signal?.aborted) return;
    setAccounts(accountData.accounts || []); setConfigured(!!accountData.configured);
    const jobsResponse = responses[1];
    if (jobsResponse) {
      if (jobsResponse.status === "rejected") throw new Error("Could not refresh publishing status. Try again.");
      const jobsData = await jobsResponse.value.json();
      if (!jobsResponse.value.ok) throw new Error(jobsData.error || "Could not load publishing status.");
      if (!signal?.aborted) setJobs(jobsData.data || []);
    }
    setLoadError("");
  }, [companyId, canPublish, managing]);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try { await refresh(signal); }
    catch (error) { if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : "Could not load connections."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [refresh]);
  useEffect(() => {
    if (!canPublish) { setLoading(false); return; }
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [canPublish, reload]);
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone"); }, []);
  useEffect(() => { setConfigured(null); setAccounts([]); setAccountId(""); setJobs([]); setPages([]); setPageId(""); setInstagramId(""); setChoosing(false); }, [companyId]);
  useEffect(() => {
    if (!jobs.some((job) => ["queued", "scheduled", "running"].includes(job.status))) return;
    const timer = setInterval(() => void refresh().catch((error) => setLoadError(error instanceof Error ? error.message : "Could not refresh publishing status.")), 15_000);
    return () => clearInterval(timer);
  }, [jobs, refresh]);
  const loadAvailablePages = useCallback(async (signal?: AbortSignal) => {
    setPagesLoading(true); setPagesError("");
    try {
      const response = await fetch("/api/auth/meta/pages?companyId=" + encodeURIComponent(companyId), { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The Meta connection expired. Start again.");
      if (signal?.aborted) return;
      setPages(data.pages || []);
      if (data.pages?.length === 1) setPageId(data.pages[0].id);
    } catch (error) { if (!signal?.aborted) setPagesError(error instanceof Error ? error.message : "Could not load Meta Pages."); }
    finally { if (!signal?.aborted) setPagesLoading(false); }
  }, [companyId]);
  useEffect(() => {
    if (!managing || searchParams.get("meta_choose_page") !== "1") return;
    setChoosing(true);
    const controller = new AbortController();
    void loadAvailablePages(controller.signal);
    return () => controller.abort();
  }, [searchParams, managing, loadAvailablePages]);
  useEffect(() => {
    const key = searchParams.get("meta_error");
    const messages: Record<string, string> = { invalid_session: "Sign in again, then connect Meta.", not_authorised: "Your account cannot connect publishing for this company.", grant_cancelled: "Meta connection was cancelled.", not_configured: "Meta publishing is not configured.", grant_invalid: "Meta did not complete the connection. Try again.", permissions_missing: "Meta did not grant the Page publishing permissions." };
    if (key) setNotice(messages[key] || "Meta connection failed. Try again.");
  }, [searchParams]);

  function finishPageSelection() {
    setChoosing(false);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("meta_choose_page"); cleanUrl.searchParams.delete("meta_error");
    window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
    onConnectionChanged?.();
  }
  async function selectPage() {
    if (!pageId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, pageId, instagramId: instagramId || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the selected Meta account.");
      setChoosing(false); setPages([]); setPageId(""); setInstagramId(""); setNotice("Meta account connected.");
      finishPageSelection(); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not connect Meta."); }
    finally { setBusy(false); }
  }
  async function queue() {
    const account = accounts.find((item) => item.id === accountId && item.usable);
    if (!account || !pieceId) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/publish/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, pieceId, socialAccountId: account.id, platform: account.platform, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue this Meta post.");
      setNotice("Post added to the " + account.platform + " queue."); setPieceId(""); setScheduledFor(""); await refresh(); onQueued?.();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not queue this Meta post."); }
    finally { setBusy(false); }
  }
  async function disconnect(id: string) {
    if (!window.confirm("Disconnect this Facebook Page and its linked Instagram account from this company?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/publish/meta", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, socialAccountId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect this Meta account.");
      setNotice(data.message || "The Facebook Page and its linked Instagram account have been disconnected."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not disconnect this Meta account."); }
    finally { setBusy(false); }
  }

  const chosenPage = pages.find((item) => item.id === pageId);
  const selectedAccount = accounts.find((item) => item.id === accountId);
  const metaJobs = jobs.filter((job) => ["facebook", "instagram"].includes(job.target_platform)).slice(0, 15);
  return <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-gray-900">{managing ? "Facebook and Instagram" : "Facebook and Instagram publishing"}</h2><p className="mt-1 text-xs text-gray-600">Publish approved text or one photo to Facebook, or one JPEG photo with a caption to Instagram.</p></div>{managing && <a href={configured && canPublish ? "/api/auth/meta?companyId=" + encodeURIComponent(companyId) + "&returnTo=setup" : undefined} aria-disabled={!configured || !canPublish} className={"min-h-11 rounded-md px-4 py-2 text-sm font-semibold text-white " + (configured && canPublish ? "bg-[#1877F2]" : "cursor-not-allowed bg-gray-400")}>{accounts.some((account) => !account.usable) ? "Reconnect Facebook and Instagram" : "Connect Facebook and Instagram"}</a>}{!managing && <Link href={`/setup/${companyId}/social`} className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">Manage connections</Link>}</div>
    {canPublish && loading && <p className="text-sm text-gray-600">Loading publishing connections...</p>}
    {canPublish && configured === false && <p className="text-sm text-amber-800">Meta publishing is not configured for this portal.</p>}
    {!canPublish && <p className="text-sm text-gray-600">Publishing is not enabled for your account.</p>}
    {loadError && <div role="alert"><p className="text-sm text-red-700">{loadError}</p><button type="button" onClick={() => void reload()} className="min-h-11 text-sm text-blue-700 underline">Try again</button></div>}
    {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
    {choosing && <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-medium text-gray-800">Choose the exact Facebook Page and linked Instagram account.</p>
      {pagesError && <div role="alert"><p className="text-sm text-red-700">{pagesError}</p><button type="button" onClick={() => void loadAvailablePages()} className="min-h-11 text-sm text-blue-700 underline">Try loading Pages again</button></div>}
      {pagesLoading ? <p className="text-sm text-gray-600">Loading available Pages...</p> : pages.length === 0 ? <p className="text-sm text-gray-600">No Pages are available to this Meta account. Check Page access, then connect again.</p> : <>
        <label className="block text-sm text-gray-700">Facebook Page<select aria-label="Facebook Page" value={pageId} onChange={(event) => { setPageId(event.target.value); setInstagramId(""); }} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="">Choose a Page</option>{pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
        {chosenPage?.instagram && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={instagramId === chosenPage.instagram.id} onChange={(event) => setInstagramId(event.target.checked ? chosenPage.instagram!.id : "")} />Also connect {chosenPage.instagram.username ? "@" + chosenPage.instagram.username : "the linked Instagram account"}</label>}
      </>}
      <div className="flex gap-2"><button type="button" onClick={() => void selectPage()} disabled={busy || !pageId || pagesLoading || !!pagesError} className="min-h-11 rounded bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Save selected account</button><button type="button" onClick={finishPageSelection} className="min-h-11 rounded border px-4 text-sm">Cancel</button></div>
    </div>}
    {managing && !loading && !loadError && (accounts.length === 0 ? <p className="text-sm text-gray-600">Not connected</p> : <div className="space-y-3"><p className="text-xs text-gray-500">A Facebook Page and its linked Instagram account share one connection.</p>{groupMetaConnections(accounts).map((group) => <div key={group.pageId} className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-100 p-3"><div className="space-y-1">{group.accounts.map((account) => <p key={account.id} className="text-sm text-gray-900">{account.platform === "facebook" ? "Facebook Page" : "Instagram"}: {account.accountName}</p>)}<p className={"text-xs " + (group.usable ? "text-green-700" : "text-amber-800")}>{group.usable ? "Connected" : "Reconnect needed"}</p></div><button type="button" onClick={() => void disconnect(group.disconnectId)} disabled={busy} className="min-h-11 text-xs text-red-700 underline disabled:opacity-50">Disconnect Page{group.accounts.some((account) => account.platform === "instagram") ? " and Instagram" : ""}</button></div>)}</div>)}
    {!managing && !loading && !loadError && <p className="text-xs text-gray-600">{accounts.some((account) => account.usable) ? `${accounts.filter((account) => account.usable).length} publishing destinations connected.` : accounts.length ? "Reconnect an account in Settings before publishing." : "Connect an account in Settings before publishing."}</p>}
    {canPublish && !managing && <div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium text-gray-700">Destination<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="">Choose an account</option>{accounts.filter((account) => account.usable).map((account) => <option key={account.id} value={account.id}>{account.platform === "facebook" ? "Facebook" : "Instagram"}: {account.accountName}</option>)}</select></label>
      <label className="text-sm font-medium text-gray-700">Approved post<select value={pieceId} onChange={(event) => setPieceId(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="">Choose an approved post</option>{pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.title || "Untitled post"}</option>)}</select></label>
      <label className="text-sm font-medium text-gray-700">Publish time <span className="font-normal text-gray-500">(leave blank to queue now)</span><input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3" /><span className="mt-1 block text-xs font-normal text-gray-500">Times use {timeZone}.</span></label><div className="flex items-end"><button onClick={() => void queue()} disabled={busy || !pieceId || !selectedAccount?.usable || !configured} className="min-h-11 rounded bg-[#1877F2] px-4 text-sm font-semibold text-white disabled:opacity-50">Add to Meta queue</button></div>
    </div>}
    {metaJobs.length > 0 && <ul className="space-y-2 border-t border-gray-100 pt-3">{metaJobs.map((job) => { const needsChecking = job.needs_checking || job.response_payload?.outcome_uncertain; return <li key={job.id} className="rounded border border-gray-100 p-3 text-sm"><div className="flex justify-between gap-3"><span>{job.content_piece?.title || job.target_platform + " post"}</span><span>{needsChecking ? "Needs checking" : job.status}</span></div><p className="mt-1 text-xs text-gray-600">Account: {job.social_account?.account_name || "Meta account"}{job.scheduled_for ? " · " + new Date(job.scheduled_for).toLocaleString() : ""}</p>{job.error_message && <p className="mt-1 text-xs text-red-700">{job.error_message}</p>}{needsChecking && <p className="mt-1 text-xs text-amber-800">Check the account before taking further action. This post was not retried.</p>}{job.external_url && <a href={job.external_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 underline">View published post</a>}</li>; })}</ul>}
  </section>;
}
