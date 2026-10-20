"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { rememberConnectionReturn } from "@/lib/connections/return-context";
import {
  DESTINATION_LABELS, EMPTY_PUBLISHING_DRAFT, destinationIssue, publishingDraftKey,
  publishingEndpoint, publishingStatus, publishingText, readPublishingDraft, scheduleIssue,
  type DestinationPlatform, type PublishingDestination, type PublishingDraft, type PublishingPiece,
} from "@/lib/publishing/workspace";

type Job = {
  id: string; content_piece_id: string; social_account_id: string | null; target_platform: string; status: string;
  scheduled_for: string | null; external_url: string | null; error_message: string | null;
  needs_checking?: boolean; response_payload?: { outcome_uncertain?: boolean } | null;
  content_piece?: { title: string | null }; social_account?: { account_name: string | null };
};
type AccountResponse = { id: string; platform?: DestinationPlatform; accountName: string; usable: boolean };
type Connections = { accounts?: AccountResponse[]; configured?: boolean | Record<string, boolean>; enabledNetworks?: string[] };
type Props = { userId: string; companyId: string; canPublish: boolean; isHospitality?: boolean };

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not load publishing information.");
  return response.json();
}

/** One company-scoped publishing journey: approved content, named destination, time, confirmation and status. Connections stay in Settings. */
export default function PublishingWorkspace({ userId, companyId, canPublish, isHospitality = false }: Props) {
  const params = useSearchParams();
  const [draft, setDraft] = useState<PublishingDraft>({ ...EMPTY_PUBLISHING_DRAFT });
  const [restored, setRestored] = useState(false);
  const [pieces, setPieces] = useState<PublishingPiece[]>([]);
  const [accounts, setAccounts] = useState<PublishingDestination[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  const [timeZone, setTimeZone] = useState("your device time zone");
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardError, setBoardError] = useState("");
  const [selectedJobs, setSelectedJobs] = useState<Job[]>([]);
  const [checkedPiece, setCheckedPiece] = useState("");
  const [lookupError, setLookupError] = useState("");
  const requestedPiece = params.get("pieceId");

  useEffect(() => {
    let saved = { ...EMPTY_PUBLISHING_DRAFT };
    try { saved = readPublishingDraft(window.sessionStorage, userId, companyId); } catch { /* Storage may be blocked. */ }
    if (requestedPiece && requestedPiece !== saved.pieceId) saved = { ...EMPTY_PUBLISHING_DRAFT, pieceId: requestedPiece };
    setDraft(saved); setRestored(true);
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone");
  }, [companyId, userId, requestedPiece]);

  useEffect(() => {
    if (!restored) return;
    try { window.sessionStorage.setItem(publishingDraftKey(userId, companyId), JSON.stringify(draft)); } catch { /* Keep working in memory when storage is unavailable. */ }
  }, [companyId, userId, draft, restored]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    const suffix = `?companyId=${encodeURIComponent(companyId)}`;
    const sources = ["approved content", "publishing status", ...(isHospitality ? [] : ["LinkedIn connections"]), "Facebook and Instagram connections", ...(isHospitality ? [] : ["other social connections"])];
    const requests: Promise<unknown>[] = [getJson(`/api/publish/approved${suffix}`, signal), getJson(`/api/publish/jobs${suffix}&limit=50`, signal)];
    if (!isHospitality) requests.push(getJson(`/api/publish/linkedin-direct${suffix}`, signal));
    requests.push(getJson(`/api/publish/meta${suffix}`, signal));
    if (!isHospitality) requests.push(getJson(`/api/publish/social${suffix}`, signal));
    const results = await Promise.allSettled(requests);
    if (signal.aborted) return;
    setErrors(results.flatMap((result, index) => result.status === "rejected" ? [sources[index]] : []));
    const content = results[0]; const history = results[1];
    setPieces(content.status === "fulfilled" ? (content.value as { data: PublishingPiece[] }).data || [] : []);
    if (history.status === "fulfilled") setJobs((history.value as { data: Job[] }).data || []);
    const destinations: PublishingDestination[] = [];
    const add = (index: number, kind: "linkedin" | "meta" | "social") => {
      const result = results[index];
      if (result?.status !== "fulfilled") return;
      const data = result.value as Connections;
      for (const account of data.accounts || []) {
        const platform = kind === "linkedin" ? "linkedin_personal" : account.platform;
        if (!platform || !(platform in DESTINATION_LABELS)) continue;
        const network = platform === "twitter" ? "x" : platform;
        destinations.push({ ...account, platform,
          configured: typeof data.configured === "object" ? !!data.configured[platform] : data.configured !== false,
          enabled: kind === "linkedin" || !!data.enabledNetworks?.includes(network),
        });
      }
    };
    if (isHospitality) add(2, "meta");
    else { add(2, "linkedin"); add(3, "meta"); add(4, "social"); }
    setAccounts(destinations); setLoading(false);
  }, [companyId, isHospitality]);

  useEffect(() => {
    if (!canPublish) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [canPublish, refresh, reload]);
  useEffect(() => {
    if (!jobs.some((job) => ["queued", "scheduled", "running"].includes(job.status))) return;
    const controller = new AbortController();
    const timer = setInterval(() => void refresh(controller.signal), 15_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [jobs, refresh]);

  const piece = pieces.find((item) => item.id === draft.pieceId);
  const account = accounts.find((item) => item.id === draft.accountId);
  useEffect(() => {
    setSelectedJobs([]); setCheckedPiece(""); setLookupError("");
    if (!canPublish || !draft.pieceId) return;
    const controller = new AbortController();
    const selectedId = draft.pieceId;
    void getJson<{ data: Job[]; count: number }>(`/api/publish/jobs?companyId=${encodeURIComponent(companyId)}&pieceId=${encodeURIComponent(selectedId)}&limit=200`, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.count !== data.data.length) throw new Error("Incomplete history");
        setSelectedJobs(data.data); setCheckedPiece(selectedId);
      }).catch(() => { if (!controller.signal.aborted) setLookupError("Could not check all previous publishing attempts for this content. Retry before submitting."); });
    return () => controller.abort();
  }, [companyId, canPublish, draft.pieceId, reload]);
  useEffect(() => {
    setBoards([]); setBoardError("");
    if (account?.platform !== "pinterest") return;
    const controller = new AbortController();
    void getJson<{ boards: { id: string; name: string }[] }>(`/api/auth/pinterest/boards?companyId=${encodeURIComponent(companyId)}&socialAccountId=${encodeURIComponent(account.id)}`, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setBoards(data.boards || []); })
      .catch(() => { if (!controller.signal.aborted) setBoardError("Could not load boards. Retry publishing information below."); });
    return () => controller.abort();
  }, [companyId, account?.id, account?.platform, reload]);

  const issue = account ? destinationIssue(piece, account) : null;
  const timingIssue = scheduleIssue(draft.scheduledFor);
  const existingJob = selectedJobs.find((job) => job.social_account_id === draft.accountId);
  const optionIssue = account?.platform === "youtube" && !draft.madeForKids ? "Answer whether the video is made for children." : account?.platform === "pinterest" && !boards.some((board) => board.id === draft.boardId) ? "Choose a Pinterest board." : null;
  const invalidPinLink = account?.platform === "pinterest" && !!draft.pinLink && (() => { try { return new URL(draft.pinLink).protocol !== "https:"; } catch { return true; } })();
  const ready = !!piece && !!account && !issue && !timingIssue && !optionIssue && !invalidPinLink && !existingJob && checkedPiece === draft.pieceId && !loading && !errors.includes("publishing status");
  const update = (changes: Partial<PublishingDraft>) => { setDraft((current) => ({ ...current, ...changes })); setConfirming(false); setNotice(""); };
  const manageConnections = () => rememberConnectionReturn(userId, companyId, "publish");

  async function queue() {
    if (!ready || !piece || !account || sending.current) return;
    sending.current = true; setSaving(true); setNotice("");
    try {
      const options = account.platform === "youtube" ? { privacy: draft.privacy, madeForKids: draft.madeForKids === "yes" }
        : account.platform === "pinterest" ? { boardId: draft.boardId, ...(draft.pinLink ? { link: draft.pinLink } : {}) } : {};
      const response = await fetch(publishingEndpoint(account.platform), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, pieceId: piece.id, socialAccountId: account.id, platform: account.platform, scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : null, options }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add this post to the queue.");
      setNotice(`${piece.title || "Content"} ${draft.scheduledFor ? "scheduled" : "queued"} for ${DESTINATION_LABELS[account.platform]}: ${account.accountName}.`);
      setConfirming(false); setDraft({ ...EMPTY_PUBLISHING_DRAFT });
      setReload((value) => value + 1);
    } catch (error) {
      setConfirming(false);
      setNotice(error instanceof Error ? error.message : "The request did not confirm. Check publishing status before trying again.");
      // Always read the queue after a failed response: the server may already have accepted it.
      setReload((value) => value + 1);
    } finally { sending.current = false; setSaving(false); }
  }

  if (!canPublish) return <section className="workspace-panel space-y-3 p-5 sm:p-6"><h2 className="text-lg font-semibold">Publishing permissions</h2><p className="text-sm text-gray-600">You can review and approve content. AGENCY manages publishing for your account.</p><Link href={isHospitality ? "/approvals" : "/review"} className="workspace-button workspace-button-secondary">Review content</Link></section>;

  return <div className="min-w-0 space-y-6 break-words">
    <section className="workspace-panel space-y-5 p-5 sm:p-6" aria-labelledby="publishing-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="publishing-heading" className="text-lg font-semibold">Publish approved content</h2><p className="mt-1 text-sm text-gray-600">Choose the content, confirm its destination, then queue or schedule it.</p></div><Link href={`/setup/${companyId}/social`} onClick={manageConnections} className="inline-flex min-h-11 items-center text-sm text-violet-700 underline">Manage connections</Link></div>
      {notice && <p role="status" className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{notice}</p>}
      {errors.length > 0 && <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>Could not load {errors.join(", ")}. Your selection has been kept.</p><button type="button" className="min-h-11 underline" onClick={() => setReload((value) => value + 1)}>Retry publishing information</button></div>}
      {loading && <p role="status" className="text-sm text-gray-600">Loading publishing information...</p>}
      {!loading && !errors.includes("approved content") && pieces.length === 0 ? <div className="space-y-3 rounded-lg border border-dashed p-5"><p className="text-sm text-gray-600">No approved content is ready. Review a draft first, then return here.</p><Link href={isHospitality ? "/approvals" : "/review"} className="workspace-button workspace-button-secondary">Review drafts</Link></div> : <>
        <fieldset disabled={saving || loading} className="min-w-0 space-y-4 disabled:opacity-70">
          <label className="block text-sm font-medium">1. Approved content<select value={draft.pieceId} onChange={(event) => update({ pieceId: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"><option value="">Choose approved content</option>{pieces.map((item) => <option key={item.id} value={item.id}>{item.title || "Untitled content"}{item.week?.date_start ? ` | week of ${item.week.date_start}` : ""}</option>)}</select></label>
          {!loading && draft.pieceId && !piece && <p role="status" className="text-sm text-amber-800">This content is no longer in the approved list. Choose another approved piece.</p>}
          <label className="block text-sm font-medium">2. Destination account<select value={draft.accountId} onChange={(event) => update({ accountId: event.target.value, boardId: "", pinLink: "", madeForKids: "", privacy: "private" })} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"><option value="">Choose a named account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{DESTINATION_LABELS[item.platform]}: {item.accountName}{item.usable ? "" : " (reconnect needed)"}</option>)}</select></label>
          {!loading && !accounts.length && <p className="text-sm text-gray-600">Connect a destination in Settings to publish. You can keep creating and reviewing content.</p>}
          {!loading && draft.accountId && !account && <p role="status" className="text-sm text-amber-800">The previous destination is no longer available. Choose an account or check Connections in Settings.</p>}
          {issue && <p role="status" className="text-sm text-amber-800">{issue}</p>}
          {existingJob && <p role="status" className="text-sm text-amber-800">This content already has a job for this account: {publishingStatus(existingJob)}. Check its status below before taking further action.</p>}
          {lookupError && <div role="alert" className="text-sm text-amber-800"><p>{lookupError}</p><button type="button" className="min-h-11 underline" onClick={() => setReload((value) => value + 1)}>Retry publishing history</button></div>}
          {account?.platform === "youtube" && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">YouTube visibility<select value={draft.privacy} onChange={(event) => update({ privacy: event.target.value as PublishingDraft["privacy"] })} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label><label className="text-sm font-medium">Is this video made for children?<select value={draft.madeForKids} onChange={(event) => update({ madeForKids: event.target.value as PublishingDraft["madeForKids"] })} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3"><option value="">Choose an answer</option><option value="no">No</option><option value="yes">Yes</option></select></label></div>}
          {account?.platform === "pinterest" && <div className="space-y-3"><p className="text-sm text-amber-800">Pinterest Trial apps create Pins visible only to their creator. Public Pins require Standard access.</p><label className="block text-sm font-medium">Pinterest board<select value={draft.boardId} onChange={(event) => update({ boardId: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3"><option value="">Choose a board</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label>{boardError && <p role="alert" className="text-sm text-red-700">{boardError}</p>}<label className="block text-sm font-medium">Pin destination link (optional)<input type="url" value={draft.pinLink} onChange={(event) => update({ pinLink: event.target.value })} maxLength={2000} placeholder="https://" className="mt-1 block min-h-11 w-full rounded-lg border px-3" /></label>{invalidPinLink && <p role="status" className="text-sm text-amber-800">Use a complete HTTPS destination link.</p>}</div>}
          <label className="block text-sm font-medium">3. Publish time<input type="datetime-local" value={draft.scheduledFor} onChange={(event) => update({ scheduledFor: event.target.value })} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3" /><span className="mt-1 block text-xs font-normal text-gray-600">Leave blank to queue now. Times use {timeZone}.</span></label>
          {timingIssue && <p role="status" className="text-sm text-amber-800">{timingIssue}</p>}
          {piece && <Link href={isHospitality ? "/review" : `/content/${piece.id}`} className="inline-flex min-h-11 items-center text-sm text-violet-700 underline">{isHospitality ? "Review venue content" : "Open content and its publishing options"}</Link>}
        </fieldset>
        {!confirming && <button type="button" disabled={!ready || saving} onClick={() => setConfirming(true)} className="workspace-button disabled:opacity-50">Review publishing details</button>}
        {confirming && piece && account && <section aria-label="Confirm publishing details" className="space-y-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
          <h3 className="text-base font-semibold">Check before {draft.scheduledFor ? "scheduling" : "queueing"}</h3>
          <dl className="space-y-2 text-sm"><div><dt className="font-medium">Destination</dt><dd>{DESTINATION_LABELS[account.platform]}: {account.accountName}</dd></div><div><dt className="font-medium">Content</dt><dd>{piece.title}</dd></div><div><dt className="font-medium">Time</dt><dd>{draft.scheduledFor ? `${new Date(draft.scheduledFor).toLocaleString("en-GB")} (${timeZone})` : "Queue now"}</dd></div>{account.platform === "youtube" && <div><dt className="font-medium">Video settings</dt><dd>{draft.privacy}, {draft.madeForKids === "yes" ? "made for children" : "not made for children"}</dd></div>}{account.platform === "pinterest" && <div><dt className="font-medium">Board</dt><dd>{boards.find((board) => board.id === draft.boardId)?.name}{draft.pinLink && ` | ${draft.pinLink}`}</dd></div>}</dl>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm">{publishingText(piece, account.platform)}</p>
          {piece.media.items.map((item) => item.kind === "image" ? <img key={item.url} src={item.url} alt={item.alt || piece.title} className="max-h-72 max-w-full rounded-lg object-contain" /> : item.kind === "video" ? <video key={item.url} src={item.url} controls preload="metadata" className="max-h-72 w-full rounded-lg" /> : null)}
          {account.platform === "linkedin_personal" && piece.preview.firstComment && <div className="text-sm"><p className="font-medium">First comment</p><p className="whitespace-pre-wrap">{piece.preview.firstComment}</p></div>}
          <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void queue()} disabled={!ready || saving} className="workspace-button disabled:opacity-50">{saving ? "Saving..." : draft.scheduledFor ? "Confirm schedule" : "Confirm queue now"}</button><button type="button" onClick={() => setConfirming(false)} disabled={saving} className="workspace-button workspace-button-secondary">Back to editing</button></div>
        </section>}
      </>}
    </section>
    {existingJob && !jobs.some((job) => job.id === existingJob.id) && <section className="workspace-panel space-y-2 p-5 text-sm" aria-label="Earlier publishing attempt"><h2 className="font-semibold">Earlier publishing attempt</h2><p>{piece?.title}: {publishingStatus(existingJob)} | {account?.accountName}</p>{existingJob.error_message && <p className="text-red-700">{existingJob.error_message}</p>}{publishingStatus(existingJob) === "Needs checking" && <p className="text-amber-800">Check the destination before taking further action. This job was not retried automatically.</p>}{existingJob.external_url && <a href={existingJob.external_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-violet-700 underline">View published content</a>}</section>}
    <section className="workspace-panel space-y-4 p-5 sm:p-6" aria-labelledby="publishing-status-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="publishing-status-heading" className="text-lg font-semibold">Recent publishing status</h2><button type="button" onClick={() => setReload((value) => value + 1)} disabled={saving || loading} className="min-h-11 text-sm text-violet-700 underline">Refresh status</button></div>
      <p className="text-xs text-gray-600">The latest 50 jobs. Selecting content above also checks its earlier attempts.</p>
      {errors.includes("publishing status") ? <p className="text-sm text-amber-800">Publishing status could not be loaded. Refresh before submitting another post.</p> : !loading && jobs.length === 0 ? <p className="text-sm text-gray-600">No publishing jobs yet.</p> : <ul className="space-y-3">{jobs.map((job) => <li key={job.id} className="space-y-2 rounded-lg border border-gray-200 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{job.content_piece?.title || "Content"}</p><span>{publishingStatus(job)}</span></div><p className="text-gray-600">{DESTINATION_LABELS[job.target_platform as DestinationPlatform] || job.target_platform}: {job.social_account?.account_name || "Account recorded with this job"}{job.scheduled_for && ` | ${new Date(job.scheduled_for).toLocaleString("en-GB")} (${timeZone})`}</p>{job.error_message && <p className="text-red-700">{job.error_message}</p>}{publishingStatus(job) === "Needs checking" && <p className="text-amber-800">Check the destination before taking further action. This job was not retried automatically.</p>}{job.external_url && <a href={job.external_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-violet-700 underline">View published content</a>}</li>)}</ul>}
    </section>
  </div>;
}
