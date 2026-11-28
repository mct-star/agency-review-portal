"use client";

import { useState } from "react";
import { CTA_CLUSTERS } from "@/lib/publishing/website-blog";
import { DeployChecklist, type DeployBlogResult } from "./DeployWeekPanel.checklist";

interface Props {
  weekId: string;
  accounts: Array<{ id: string; name: string }>;
  queueCount: number;
  /** The days with a post that can be queued, so each can be ticked on or off. */
  days?: Array<{ date: string; label: string; count: number }>;
  showCtaPicker: boolean;
  /** The services the blog can point readers to: the company's own list. Defaults to AGENCY's. */
  clusters?: ReadonlyArray<{ code: string; label: string }>;
}

type NotQueued = { pieceId: string; title: string; reason: string; next: "export" | "by_hand" | "approve" };

interface DeployResult {
  queued: Array<{ pieceId: string; title: string; scheduledFor: string }>;
  alreadyQueued: Array<{ pieceId: string; title: string; note: string }>;
  notQueued: NotQueued[];
  refused?: Array<{ pieceId: string; title: string }>;
  blogs: DeployBlogResult[];
  newsletters: Array<{ id: string; title: string; copyHref: string }>;
  schedulerExportHref: string;
}

/**
 * The one Deploy week action. Nothing happens until the person presses
 * Deploy week and then confirms; the route refuses a request without that
 * confirmation. Afterwards it shows what was queued and the manual steps.
 */
interface PreviewItem {
  pieceId: string; title: string; scheduledFor: string; account: string | null; text: string; media: string;
  firstComment: string | null; warnings: string[]; mentions: string[];
}

export default function DeployWeekPanel({ weekId, accounts, queueCount, days = [], showCtaPicker, clusters = CTA_CLUSTERS }: Props) {
  const [ticked, setTicked] = useState<string[]>(days.map((d) => d.date));
  const [previewItems, setPreviewItems] = useState<PreviewItem[] | null>(null);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : "");
  const [cluster, setCluster] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeployResult | null>(null);

  const dayFilter = days.length > 0 ? ticked : undefined;
  const selectedCount = days.length > 0 ? days.filter((d) => ticked.includes(d.date)).reduce((n, d) => n + d.count, 0) : queueCount;

  async function showPreview() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publish/deploy-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, preview: true, days: dayFilter, socialAccountId: accountId || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setPreviewItems(json.items as PreviewItem[]);
      setConfirming(true);
    } catch (err) {
      setError(`No preview: ${err instanceof Error ? err.message : "failed"}.`);
    } finally {
      setBusy(false);
    }
  }

  const needsAccount = queueCount > 0 && accounts.length > 1 && !accountId;

  async function deploy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publish/deploy-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, confirm: true, days: dayFilter, socialAccountId: accountId || undefined, ctaCluster: cluster || undefined }),
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

  // Each heading is true for every post under it: only the types the
  // scheduler export carries are said to be in it.
  const NOT_QUEUED_GROUPS: Array<{ next: NotQueued["next"]; heading: string }> = [
    { next: "export", heading: "Not queued, so in the scheduler export:" },
    { next: "by_hand", heading: "Not queued and not in the scheduler export. Publish these by hand:" },
    { next: "approve", heading: "Not queued. Approve the current version, then deploy again:" },
  ];

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
          {result.alreadyQueued.length > 0 && (
            <>
              <p className="mt-3 font-semibold">Already in the LinkedIn queue, so not queued again:</p>
              <ul className="mt-1 space-y-1">
                {result.alreadyQueued.map((a) => <li key={a.pieceId}>{a.title}: {a.note}</li>)}
              </ul>
            </>
          )}
          {(result.refused?.length ?? 0) > 0 && (
            <>
              <p className="mt-3 font-semibold">Refused, not approved. Approve them, then deploy again:</p>
              <ul className="mt-1 space-y-1">{result.refused!.map((r) => <li key={r.pieceId}>{r.title}</li>)}</ul>
            </>
          )}
          {NOT_QUEUED_GROUPS.map(({ next, heading }) => {
            const items = result.notQueued.filter((n) => n.next === next);
            if (!items.length) return null;
            return (
              <div key={next}>
                <p className="mt-3 font-semibold">{heading}</p>
                <ul className="mt-1 space-y-1">
                  {items.map((n) => <li key={n.pieceId}>{n.title}: {n.reason}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
        <DeployChecklist
          blogs={result.blogs}
          newsletters={result.newsletters}
          schedulerExportHref={result.schedulerExportHref}
          exportCount={result.notQueued.filter((n) => n.next === "export").length}
        />
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
      {showCtaPicker && clusters.length > 0 && (
        <label className="block text-sm text-gray-700">
          Which service does the blog point readers to?
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm">
            <option value="">Leave the blog for later</option>
            {clusters.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
      )}
      {days.length > 0 && !confirming && (
        <fieldset className="text-sm text-gray-700">
          <legend className="font-medium">Days to schedule</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {days.map((d) => (
              <label key={d.date} className="flex items-center gap-1">
                <input type="checkbox" checked={ticked.includes(d.date)} onChange={(e) => setTicked(e.target.checked ? [...ticked, d.date] : ticked.filter((x) => x !== d.date))} />
                {d.label} ({d.count})
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!confirming ? (
        <button type="button" className="workspace-button" disabled={needsAccount || busy || (days.length > 0 && selectedCount === 0)} onClick={showPreview}>
          {busy ? "Loading preview..." : "Preview schedule"}
        </button>
      ) : (
        <div className="rounded-lg border border-gray-300 bg-white p-4 text-sm">
          {previewItems && (
            <ul className="mb-3 space-y-3">
              {previewItems.map((p) => (
                <li key={p.pieceId} className="rounded-md border border-gray-200 p-3">
                  <p className="font-semibold">{ukTime(p.scheduledFor)} to {p.account || "LinkedIn"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{p.text}</p>
                  <p className="mt-1 text-gray-600">Media: {p.media}</p>
                  {p.firstComment && <p className="mt-1 text-gray-600">First comment: {p.firstComment}</p>}
                  {p.mentions.length > 0 && <p className="mt-1 text-gray-600">Mentions: {p.mentions.join(", ")}</p>}
                  {p.warnings.map((w) => <p key={w} role="alert" className="mt-1 text-amber-800">Warning: ＠{w} is not in the mention list, so it will be published as plain text.</p>)}
                </li>
              ))}
              {previewItems.length === 0 && <li>No posts will be queued for the days ticked.</li>}
            </ul>
          )}
          <p>Queue {selectedCount} {selectedCount === 1 ? "post" : "posts"} at {selectedCount === 1 ? "its" : "their"} scheduled time{showCtaPicker && cluster ? " and open the blog pull request" : ""}? Nothing goes live before its time, and the blog goes live only when its pull request is merged.</p>
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
