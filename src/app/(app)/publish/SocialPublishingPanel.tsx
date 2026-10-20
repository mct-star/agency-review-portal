"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Platform = "bluesky" | "threads" | "twitter" | "youtube" | "pinterest";
type Account = { id: string; platform: Platform; accountId: string; accountName: string; usable: boolean };
type Piece = { id: string; title: string | null; contentType: string; mediaKind?: string | null };
type Job = { id: string; target_platform: string; status: string; scheduled_for: string | null; external_url: string | null; error_message: string | null; needs_checking?: boolean; response_payload?: { outcome_uncertain?: boolean }; content_piece?: { title: string | null }; social_account?: { account_name: string | null } };
const platforms: { id: Platform; label: string; auth: string; network: string }[] = [
  { id: "bluesky", label: "Bluesky", auth: "bluesky", network: "bluesky" },
  { id: "threads", label: "Threads", auth: "threads", network: "threads" },
  { id: "twitter", label: "X", auth: "x", network: "x" },
  { id: "youtube", label: "YouTube", auth: "youtube", network: "youtube" },
  { id: "pinterest", label: "Pinterest", auth: "pinterest", network: "pinterest" },
];
const labelFor = (platform: string) => platforms.find((item) => item.id === platform)?.label || platform;

/** Connects exact social destinations and queues approved content through the shared publishing worker. */
export default function SocialPublishingPanel({ companyId, canPublish, canConnect = false, onQueued }: { companyId: string; canPublish: boolean; canConnect?: boolean; onQueued?: () => void }) {
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [configured, setConfigured] = useState<Partial<Record<Platform, boolean>>>({});
  const [enabled, setEnabled] = useState<string[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [accountId, setAccountId] = useState("");
  const [pieceId, setPieceId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [madeForKids, setMadeForKids] = useState("");
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [pinLink, setPinLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [boardNotice, setBoardNotice] = useState("");
  const [timeZone, setTimeZone] = useState("your device time zone");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const responses = await Promise.allSettled([
      fetch(`/api/publish/social?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store", signal }),
      fetch(`/api/publish/jobs?companyId=${encodeURIComponent(companyId)}&limit=50`, { cache: "no-store", signal }),
    ]);
    if (signal?.aborted) return;
    const connection = responses[0];
    if (connection.status === "rejected") throw new Error("Could not load social connections. Try again.");
    const data = await connection.value.json();
    if (!connection.value.ok) throw new Error(data.error || "Could not load social connections.");
    if (signal?.aborted) return;
    setConfigured(data.configured || {}); setEnabled(data.enabledNetworks || []);
    setAccounts(data.accounts || []); setPieces(data.pieces || []);
    const queue = responses[1];
    if (queue.status === "rejected") throw new Error("Connections loaded, but publishing status could not be refreshed.");
    const queueData = await queue.value.json();
    if (!queue.value.ok) throw new Error(queueData.error || "Could not load publishing status.");
    if (!signal?.aborted) setJobs(queueData.data || []);
  }, [companyId]);

  useEffect(() => {
    if (!canPublish) { setLoading(false); return; }
    const controller = new AbortController();
    void refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not load connections."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canPublish, refresh]);
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone"); }, []);
  useEffect(() => {
    if (!jobs.some((job) => platforms.some((platform) => platform.id === job.target_platform) && ["queued", "scheduled", "running"].includes(job.status))) return;
    const controller = new AbortController();
    const timer = setInterval(() => void refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not refresh publishing status."); }), 15_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [jobs, refresh]);
  useEffect(() => {
    if (params.get("youtube_error") === "ambiguous_channel") setNotice("Google returned more than one YouTube channel. Choose the intended YouTube identity in Google's sign-in or default-channel settings, then connect again. Your saved accounts have been kept.");
    else if (params.get("youtube_error") === "unexpected_scope") setNotice("The YouTube connection included access to other Google services and was not saved. Contact your platform administrator to check the connection settings.");
    else if (platforms.some((platform) => params.has(`${platform.auth}_error`))) setNotice("The social connection did not complete. Start Connect again. Your saved accounts have been kept.");
  }, [params]);

  const selected = accounts.find((account) => account.id === accountId);
  const definition = platforms.find((platform) => platform.id === selected?.platform);
  const networkEnabled = !!definition && enabled.includes(definition.network);
  useEffect(() => {
    setBoards([]); setBoardId(""); setBoardNotice("");
    if (selected?.platform !== "pinterest") return;
    const controller = new AbortController();
    void fetch(`/api/auth/pinterest/boards?companyId=${encodeURIComponent(companyId)}&socialAccountId=${encodeURIComponent(selected.id)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load Pinterest boards.");
      if (!controller.signal.aborted) { setBoards(data.boards || []); if (data.boards?.length === 1) setBoardId(data.boards[0].id); }
    }).catch((error) => { if (!controller.signal.aborted) setBoardNotice(error instanceof Error ? error.message : "Could not load Pinterest boards."); });
    return () => controller.abort();
  }, [companyId, selected?.id, selected?.platform]);

  async function disconnect(id: string) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/publish/social", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, socialAccountId: id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect this account.");
      if (accountId === id) { setAccountId(""); setPieceId(""); }
      setNotice("Account disconnected."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not disconnect this account."); }
    finally { setBusy(false); }
  }
  async function queue() {
    if (!selected || !pieceId) return;
    setBusy(true); setNotice("");
    try {
      const options = selected.platform === "youtube" ? { privacy, madeForKids: madeForKids === "yes" } : selected.platform === "pinterest" ? { boardId, ...(pinLink.trim() ? { link: pinLink.trim() } : {}) } : {};
      const response = await fetch("/api/publish/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, pieceId, socialAccountId: selected.id, platform: selected.platform, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null, options }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue this post.");
      setNotice(`Approved content added to the ${labelFor(selected.platform)} queue.`); setPieceId(""); setScheduledFor(""); await refresh(); onQueued?.();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not queue this post."); }
    finally { setBusy(false); }
  }
  const choices = pieces.filter((piece) => selected?.platform === "youtube" ? piece.mediaKind === "video" : piece.contentType === "social_post" && (selected?.platform === "pinterest" ? piece.mediaKind === "image" : !["video", "images", "document"].includes(piece.mediaKind || "none")));
  const needsOptions = selected?.platform === "pinterest" ? !boardId : selected?.platform === "youtube" ? !madeForKids : false;
  const recent = jobs.filter((job) => platforms.some((platform) => platform.id === job.target_platform)).slice(0, 15);

  return <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
    <div><h2 className="text-sm font-semibold text-gray-900">More social accounts</h2><p className="mt-1 text-sm text-gray-600">Connect a destination, then choose approved content and when it should publish.</p></div>
    {!canPublish ? <p className="text-sm text-gray-600">Publishing is not enabled for your account.</p> : <>
      {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
      {loading ? <p className="text-sm text-gray-600">Loading connections...</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{platforms.map((platform) => <div key={platform.id} className="space-y-2 rounded-md border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-900">{platform.label}</h3>
        {accounts.filter((account) => account.platform === platform.id).map((account) => <div key={account.id} className="space-y-1 text-sm"><p>{account.accountName}{account.usable ? "" : " (reconnect needed)"}</p><button type="button" disabled={busy} onClick={() => void disconnect(account.id)} className="min-h-11 text-xs text-red-700 underline disabled:opacity-50">Disconnect {account.accountName}</button></div>)}
        {!canConnect ? <p className="text-xs text-gray-600">AGENCY manages connections for this company.</p> : !configured[platform.id] ? <p className="text-xs text-gray-600">Connection setup is still required.</p> : platform.id === "bluesky" ? <form action="/api/auth/bluesky" method="get" className="space-y-2"><input type="hidden" name="companyId" value={companyId} /><input type="hidden" name="returnTo" value="publish" /><label className="block text-xs text-gray-700">Bluesky handle<input name="handle" required autoComplete="username" placeholder="name.bsky.social" maxLength={253} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3 text-sm" /></label><button type="submit" className="min-h-11 rounded-md bg-sky-700 px-3 text-sm font-semibold text-white">Connect Bluesky</button></form> : <a href={`/api/auth/${platform.auth}?companyId=${encodeURIComponent(companyId)}&returnTo=publish`} className="inline-flex min-h-11 items-center rounded-md bg-sky-700 px-3 text-sm font-semibold text-white">Connect {platform.label}</a>}
      </div>)}</div>}
      {accounts.length > 0 && <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Social destination<select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPieceId(""); setMadeForKids(""); setPrivacy("private"); setPinLink(""); }} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id} disabled={!account.usable}>{labelFor(account.platform)}: {account.accountName}{account.usable ? "" : " (reconnect needed)"}</option>)}</select></label>
        <label className="text-sm font-medium text-gray-700">Approved content<select value={pieceId} onChange={(event) => setPieceId(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3" disabled={!selected}><option value="">Choose approved content</option>{choices.map((piece) => <option key={piece.id} value={piece.id}>{piece.title || "Untitled post"}</option>)}</select></label>
        {selected && !networkEnabled && <p role="status" className="text-sm text-amber-800 md:col-span-2">Ask AGENCY to enable {labelFor(selected.platform)} publishing for this company.</p>}
        {selected && choices.length === 0 && <p className="text-sm text-gray-600 md:col-span-2">{selected.platform === "youtube" ? "No approved rendered videos are available." : "No approved posts with supported media are available."}</p>}
        {selected?.platform === "pinterest" && <><p className="text-sm text-amber-800 md:col-span-2">Pinterest Trial apps create Pins visible only to their creator. Public Pins require Pinterest Standard access.</p><label className="text-sm font-medium text-gray-700">Pinterest board<select value={boardId} onChange={(event) => setBoardId(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="">Choose a board</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select>{boardNotice && <span role="status" className="mt-1 block text-xs text-red-700">{boardNotice}</span>}</label><label className="text-sm font-medium text-gray-700">Pin destination link (optional)<input type="url" value={pinLink} onChange={(event) => setPinLink(event.target.value)} maxLength={2000} placeholder="https://" className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3" /></label></>}
        {selected?.platform === "youtube" && <><label className="text-sm font-medium text-gray-700">YouTube visibility<select value={privacy} onChange={(event) => setPrivacy(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label><label className="text-sm font-medium text-gray-700">Is this video made for children?<select value={madeForKids} onChange={(event) => setMadeForKids(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3"><option value="">Choose an answer</option><option value="no">No</option><option value="yes">Yes</option></select></label></>}
        <label className="text-sm font-medium text-gray-700">Social publish time <span className="font-normal">(leave blank to queue now)</span><input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-gray-300 px-3" /><span className="mt-1 block text-xs font-normal text-gray-500">Times use {timeZone}.</span></label>
        <div className="flex items-end"><button disabled={busy || !pieceId || !selected?.usable || !networkEnabled || !configured[selected.platform] || needsOptions} onClick={() => void queue()} className="min-h-11 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Add to social queue"}</button></div>
      </div>}
      {recent.length > 0 && <ul className="space-y-2 border-t border-gray-100 pt-4">{recent.map((job) => <li key={job.id} className="space-y-1 rounded border border-gray-200 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{job.content_piece?.title || `${labelFor(job.target_platform)} post`}</span><span>{job.needs_checking || job.response_payload?.outcome_uncertain ? "Needs checking" : job.status}</span></div><p className="text-xs text-gray-600">{labelFor(job.target_platform)}: {job.social_account?.account_name || "Selected account"}{job.scheduled_for ? ` · ${new Date(job.scheduled_for).toLocaleString()}` : ""}</p>{job.error_message && <p className="text-xs text-red-700">{job.error_message}</p>}{(job.needs_checking || job.response_payload?.outcome_uncertain) && <p className="text-xs text-amber-800">Check the destination before publishing again. This job was not retried.</p>}{job.external_url && <a href={job.external_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs text-sky-700 underline">View published content</a>}</li>)}</ul>}
    </>}
  </section>;
}
