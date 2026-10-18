"use client";

import { useCallback, useEffect, useState } from "react";
import MetricoolExportButton from "@/components/weeks/MetricoolExportButton";
import MetaPublishingPanel from "./MetaPublishingPanel";

type Account = { id: string; accountName: string; accountId: string | null; usable: boolean; expiresAt: string | null };
type Piece = { id: string; title: string | null; content_type: string; week_id: string | null };
type Job = {
  id: string; status: string; target_platform: string; scheduled_for: string | null;
  published_at: string | null; external_url: string | null; error_message: string | null;
  needs_checking?: boolean;
  content_piece?: { title: string | null };
  social_account?: { account_name: string | null };
};
type Week = { id: string; date_start: string; date_end: string };

const statusLabel: Record<string, string> = { queued: "Waiting", scheduled: "Scheduled", running: "Publishing", published: "Published", failed: "Failed", uncertain: "Needs checking" };

/** Client publishing controls remain company scoped and show only safe account metadata. */
export default function ClientPublishView({ companyId, canPublish, weeks, pieces, isHospitality = false }: { companyId: string; canPublish: boolean; weeks: Week[]; pieces: Piece[]; isHospitality?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [accountId, setAccountId] = useState("");
  const [pieceId, setPieceId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!canPublish || isHospitality) { setAccounts([]); setJobs([]); return; }
    try {
      const [accountRes, jobsRes] = await Promise.all([
        fetch(`/api/publish/linkedin-direct?companyId=${encodeURIComponent(companyId)}`),
        fetch(`/api/publish/jobs?companyId=${encodeURIComponent(companyId)}&limit=50`),
      ]);
      const accountData = await accountRes.json();
      const jobsData = await jobsRes.json();
      if (!accountRes.ok || !jobsRes.ok) throw new Error(accountData.error || jobsData.error || "Could not refresh publishing status.");
      setAccounts(accountData.accounts || []);
      setJobs(jobsData.data || []);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not refresh publishing status.");
    }
  }, [canPublish, companyId, isHospitality]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!jobs.some((job) => ["queued", "scheduled", "running"].includes(job.status))) return;
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [jobs, refresh]);
  const approvedPosts = pieces.filter((piece) => piece.content_type === "social_post");

  async function queue() {
    if (!pieceId || !accountId || !canPublish) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/publish/linkedin-direct", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, pieceId, socialAccountId: accountId, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue this post.");
      setNotice("Post added to the LinkedIn queue.");
      setPieceId("");
      setScheduledFor("");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not queue this post.");
    } finally {
      setSaving(false);
    }
  }

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const usableAccounts = accounts.filter((account) => account.usable);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Publish</h1>

      {!isHospitality && <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Publish approved posts to LinkedIn</h2>
        {!canPublish ? <p className="text-sm text-gray-600">Publishing is not enabled for your account. You can still download approved posts below.</p> : <>
          {usableAccounts.length === 0 && <p className="text-sm text-amber-800">A LinkedIn account needs to be connected by AGENCY before you can queue a post. Ask AGENCY to reconnect the account.</p>}
          {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
          <label className="block text-sm font-medium text-gray-700">LinkedIn account
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-gray-300 px-3" disabled={!usableAccounts.length}>
              <option value="">Choose an account</option>
              {accounts.map((account) => <option key={account.id} value={account.id} disabled={!account.usable}>{account.accountName}{account.usable ? "" : " (reconnect needed)"}</option>)}
            </select>
          </label>
          {selectedAccount?.usable && <p className="text-xs text-gray-500">Selected destination: {selectedAccount.accountName}</p>}
          <label className="block text-sm font-medium text-gray-700">Approved post
            <select value={pieceId} onChange={(event) => setPieceId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-gray-300 px-3">
              <option value="">Choose an approved post</option>
              {approvedPosts.map((piece) => <option key={piece.id} value={piece.id}>{piece.title || "Untitled post"}</option>)}
            </select>
          </label>
          {approvedPosts.length === 0 && <p className="text-sm text-gray-600">There are no approved social posts ready to publish.</p>}
          <label className="block text-sm font-medium text-gray-700">Publish time <span className="font-normal text-gray-500">(leave blank to queue now)</span>
            <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-gray-300 px-3" />
          </label>
          <button onClick={() => void queue()} disabled={saving || !pieceId || !selectedAccount?.usable} className="min-h-11 rounded-md bg-[#0077B5] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Adding to queue…" : "Add to LinkedIn queue"}</button>
        </>}
      </section>}

      <MetaPublishingPanel companyId={companyId} canPublish={canPublish} pieces={approvedPosts} />

      {!isHospitality && <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">LinkedIn queue</h2>
        {jobs.length === 0 ? <p className="text-sm text-gray-600">No LinkedIn posts in the queue.</p> : <ul className="space-y-3">
          {jobs.filter((job) => job.target_platform === "linkedin_personal").map((job) => <li key={job.id} className="rounded border border-gray-100 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-gray-900">{job.content_piece?.title || "LinkedIn post"}</span><span>{job.needs_checking ? "Needs checking" : statusLabel[job.status] || job.status}</span></div>
            <p className="mt-1 text-xs text-gray-600">Account: {job.social_account?.account_name || "LinkedIn profile"}{job.scheduled_for ? ` · ${new Date(job.scheduled_for).toLocaleString()}` : ""}</p>
            {job.error_message && <p className="mt-1 text-xs text-red-700">{job.error_message}</p>}
            {job.needs_checking && <p className="mt-1 text-xs text-amber-800">Check this LinkedIn account before trying again. The post was not retried automatically.</p>}
            {job.external_url && <a href={job.external_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 underline">View on LinkedIn</a>}
          </li>)}
        </ul>}
      </section>}

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Download approved posts</h2>
        {weeks.length === 0 ? <p className="text-sm text-gray-600">You have no approved posts yet.</p> : <ul className="space-y-3">{weeks.map((week) => <li key={week.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-800"><span>{new Date(`${week.date_start}T12:00:00`).toLocaleDateString()} to {new Date(`${week.date_end}T12:00:00`).toLocaleDateString()} · {pieces.filter((piece) => piece.week_id === week.id).length} approved posts</span><MetricoolExportButton weekId={week.id} draft={false} /></li>)}</ul>}
      </section>
    </div>
  );
}
