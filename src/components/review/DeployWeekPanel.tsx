"use client";

import { useState } from "react";
import { CTA_CLUSTERS } from "@/lib/publishing/website-blog";
import { DeployChecklist, type DeployBlogResult } from "./DeployWeekPanel.checklist";

interface Props {
  weekId: string;
  accounts: Array<{ id: string; name: string }>;
  queueCount: number;
  showCtaPicker: boolean;
}

interface DeployResult {
  queued: Array<{ pieceId: string; title: string; scheduledFor: string }>;
  alreadyQueued: Array<{ pieceId: string; title: string }>;
  notQueued: Array<{ pieceId: string; title: string; reason: string }>;
  blogs: DeployBlogResult[];
  newsletters: Array<{ id: string; title: string; copyHref: string }>;
  schedulerExportHref: string;
}

/**
 * The one Deploy week action. Nothing happens until the person presses
 * Deploy week and then confirms; the route refuses a request without that
 * confirmation. Afterwards it shows what was queued and the manual steps.
 */
export default function DeployWeekPanel({ weekId, accounts, queueCount, showCtaPicker }: Props) {
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : "");
  const [cluster, setCluster] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);

  const needsAccount = queueCount > 0 && accounts.length > 1 && !accountId;

  async function deploy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publish/deploy-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, confirm: true, socialAccountId: accountId || undefined, ctaCluster: cluster || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setResult(json as DeployResult);
      setConfirming(false);
    } catch (err) {
      setError(`Not deployed: ${err instanceof Error ? err.message : "failed"}.`);
    } finally {
      setBusy(false);
    }
  }

  const ukTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (result) {
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">
            {result.queued.length} {result.queued.length === 1 ? "post" : "posts"} queued for LinkedIn
            {result.alreadyQueued.length > 0 && `, ${result.alreadyQueued.length} already in the queue`}.
          </p>
          <ul className="mt-2 space-y-1">
            {result.queued.map((q) => <li key={q.pieceId}>{q.title}: {ukTime(q.scheduledFor)}</li>)}
          </ul>
          {result.notQueued.length > 0 && (
            <>
              <p className="mt-3 font-semibold">Not queued, so in the scheduler export:</p>
              <ul className="mt-1 space-y-1">
                {result.notQueued.map((n) => <li key={n.pieceId}>{n.title}: {n.reason}</li>)}
              </ul>
            </>
          )}
        </div>
        <DeployChecklist blogs={result.blogs} newsletters={result.newsletters} schedulerExportHref={result.schedulerExportHref} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {queueCount > 0 && accounts.length > 1 && (
        <label className="block text-sm text-gray-700">
          LinkedIn account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm">
            <option value="">Choose an account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      {showCtaPicker && (
        <label className="block text-sm text-gray-700">
          Which service does the blog point readers to?
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm">
            <option value="">Leave the blog for later</option>
            {CTA_CLUSTERS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
      )}
      {!confirming ? (
        <button type="button" className="workspace-button" disabled={needsAccount} onClick={() => setConfirming(true)}>
          Deploy week
        </button>
      ) : (
        <div className="rounded-lg border border-gray-300 bg-white p-4 text-sm">
          <p>Queue {queueCount} {queueCount === 1 ? "post" : "posts"} at {queueCount === 1 ? "its" : "their"} scheduled time{showCtaPicker && cluster ? " and open the blog pull request" : ""}? Nothing goes live before its time, and the blog goes live only when its pull request is merged.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="workspace-button" disabled={busy} onClick={deploy}>
              {busy ? "Deploying..." : "Confirm Deploy week"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-md border border-gray-300 px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
