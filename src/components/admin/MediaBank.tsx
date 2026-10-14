"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaKind } from "@/lib/upload/media-constants";
import { formatBytes } from "@/lib/media/quota";
import { GROUP_LABELS, TAG_GROUPS, TAG_VOCABULARY, readableTag, tagKey } from "@/lib/media/vocabulary";
import UploadPanel from "@/components/library/UploadPanel";
import TagEditor from "@/components/library/TagEditor";
import StaffLinkPanel from "@/components/library/StaffLinkPanel";

export interface BankItem {
  id: string;
  kind: MediaKind;
  /** One-hour signed URL for the thumbnail or video poster. Never the original. */
  thumb_url: string | null;
  original_filename: string | null;
  scene_label: string | null;
  tags: string[];
  shows_spokesperson: boolean;
  people_present: boolean | null;
  text_space: boolean;
  notes: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  size_bytes?: number | null;
  status?: "approved" | "pending";
  submitted_by?: string | null;
  auto_tagged_at?: string | null;
  auto_tag_error?: string | null;
  added_at: string;
  last_used_at: string | null;
}

interface Usage { usedBytes: number; capBytes: number; remainingBytes: number; fraction: number }

type CompanyOption = { id: string; name: string; spokesperson_name: string | null; post_pack?: string | null };

/** The company's photos and footage, uploaded once and reused across posts. */
export default function MediaBank({ companies, initialCompanyId }: { companies: CompanyOption[]; initialCompanyId: string }) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [view, setView] = useState<"approved" | "pending">("approved");
  const [kind, setKind] = useState<"all" | MediaKind>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<BankItem[]>([]);
  const [total, setTotal] = useState(0);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pending, setPending] = useState(0);
  const [untagged, setUntagged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<BankItem | null>(null);
  const [tagging, setTagging] = useState(false);
  const polls = useRef(0);

  const company = companies.find((c) => c.id === companyId);
  const hospitality = company?.post_pack === "hospitality";
  const person = company?.spokesperson_name || "the spokesperson";

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    const params = new URLSearchParams({ companyId, status: view, offset: String(offset) });
    if (kind !== "all") params.set("kind", kind);
    for (const t of activeTags) params.append("tag", t);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/bank?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || `Could not load the library (${res.status})`);
    } else {
      setError(null);
      setItems((prev) => (offset === 0 ? data.data || [] : [...prev, ...(data.data || [])]));
      setTotal(data.total ?? 0);
      setUsage(data.usage ?? null);
      setPending(data.pending ?? 0);
      setUntagged(data.untagged ?? 0);
    }
    setLoading(false);
  }, [companyId, kind, activeTags, q, view]);

  useEffect(() => { load(0); }, [load]);

  // Tags are written a few seconds after a file lands. Look again a handful
  // of times, then stop: a file that cannot be tagged must not keep us polling.
  useEffect(() => {
    if (untagged === 0 || polls.current >= 12) return;
    const t = setTimeout(() => { polls.current += 1; load(0); }, 5000);
    return () => clearTimeout(t);
  }, [untagged, load, items]);

  const onLanded = useCallback(() => { polls.current = 0; load(0); }, [load]);

  async function save(item: BankItem, change: Partial<BankItem>) {
    const next = { ...item, ...change };
    setItems((all) => all.map((i) => (i.id === item.id ? next : i)));
    setSelected((s) => (s && s.id === item.id ? next : s));
    const res = await fetch(`/api/bank/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "That change was not saved");
      load(0);
    }
  }

  async function remove(item: BankItem) {
    if (!window.confirm(`Remove ${item.original_filename || "this file"} from the library? Posts that already use it keep their copy.`)) return;
    const res = await fetch(`/api/bank/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Not removed"); return; }
    setItems((all) => all.filter((i) => i.id !== item.id));
    setSelected(null);
    load(0);
  }

  async function review(ids: string[], decision: "approve" | "reject") {
    const res = await fetch("/api/bank/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ids, decision }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "That did not work"); return; }
    setNotice(decision === "approve" ? `${data.changed} added to the library` : `${data.changed} removed`);
    setSelected(null);
    load(0);
  }

  async function tagNow(ids?: string[]) {
    setTagging(true);
    setNotice(null);
    const res = await fetch("/api/bank/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ids }) });
    const data = await res.json().catch(() => ({}));
    setTagging(false);
    if (!res.ok) { setError(data.error || "Could not tag them"); return; }
    setNotice(data.failed > 0 ? `${data.tagged} tagged, ${data.failed} could not be tagged just now. You can tag those by hand.` : `${data.tagged} tagged`);
    load(0);
  }

  function toggleFilterTag(tag: string) {
    setActiveTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Photo and video library</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your real photos and clips, added once and used on posts. {total} {view === "pending" ? "waiting for you" : "in the library"}.
          </p>
        </div>
        {companies.length > 1 && (
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setActiveTags([]); setView("approved"); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {usage && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>{formatBytes(usage.usedBytes)} of {formatBytes(usage.capBytes)} used</span>
            {usage.fraction >= 0.9 && <span className="font-medium text-amber-700">{usage.fraction >= 1 ? "Full. New uploads are paused until you remove some files." : "Nearly full"}</span>}
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-gray-200" role="progressbar" aria-valuenow={Math.round(usage.fraction * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Library storage used">
            <div className={`h-full ${usage.fraction >= 0.9 ? "bg-amber-500" : "bg-violet-500"}`} style={{ width: `${Math.max(2, Math.round(usage.fraction * 100))}%` }} />
          </div>
        </div>
      )}

      {pending > 0 && view === "approved" && (
        <button onClick={() => setView("pending")} className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100">
          <span><strong>{pending}</strong> {pending === 1 ? "photo" : "photos"} from your team {pending === 1 ? "is" : "are"} waiting for you to approve.</span>
          <span className="font-medium">Look now</span>
        </button>
      )}

      {view === "approved" ? (
        <UploadPanel key={companyId} companyId={companyId} onLanded={onLanded} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Photos sent in from your team. Nothing here can go on a post until you approve it.</span>
          <span className="flex gap-2">
            {items.length > 0 && <button onClick={() => review(items.map((i) => i.id), "approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Approve all shown</button>}
            <button onClick={() => setView("approved")} className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100">Back to the library</button>
          </span>
        </div>
      )}

      {view === "approved" && <StaffLinkPanel key={`link-${companyId}`} companyId={companyId} />}

      {notice && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p>}
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      {view === "approved" && untagged > 0 && polls.current >= 12 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          <span>{untagged} {untagged === 1 ? "file has" : "files have"} no tags yet.</span>
          <button onClick={() => tagNow()} disabled={tagging} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">{tagging ? "Tagging..." : "Tag them now"}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["all", "photo", "video"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-700"}`}>
            {k === "all" ? "All" : k === "photo" ? "Photos" : "Videos"}
          </button>
        ))}
        <button onClick={() => setShowFilters((v) => !v)} className={`rounded-full border px-3 py-1 ${activeTags.length > 0 ? "border-violet-500 text-violet-700" : "border-gray-200 text-gray-700"}`} aria-expanded={showFilters}>
          {activeTags.length > 0 ? `Filtered by ${activeTags.length}` : "Filter by tag"}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what it shows" aria-label="Search the library" className="min-w-[180px] flex-1 rounded-md border border-gray-200 px-3 py-1 text-sm" />
      </div>

      {showFilters && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          {TAG_GROUPS.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-xs font-medium text-gray-600">{GROUP_LABELS[g]}</span>
              {TAG_VOCABULARY[g].map((v) => {
                const key = tagKey(g, v);
                const on = activeTags.includes(key);
                return (
                  <button key={key} onClick={() => toggleFilterTag(key)} aria-pressed={on} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-violet-600 bg-violet-600 text-white" : "border-gray-200 text-gray-700 hover:border-violet-300"}`}>
                    {readableTag(v)}
                  </button>
                );
              })}
            </div>
          ))}
          {activeTags.length > 0 && <button onClick={() => setActiveTags([])} className="text-xs text-violet-700 hover:underline">Clear filters</button>}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-500">Loading...</p> : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          {view === "pending" ? "Nothing is waiting for you." : activeTags.length > 0 || q ? "Nothing matches that." : hospitality ? "Nothing here yet. Drop in photos of the place, the food and the team." : `Nothing here yet. Drop in photos and clips of ${person}.`}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((it) => (
              <BankTile key={it.id} item={it} onClick={() => setSelected(it)}
                badge={view === "pending" ? "Waiting" : undefined}
                actions={view === "pending" ? { approve: () => review([it.id], "approve"), reject: () => review([it.id], "reject") } : undefined} />
            ))}
          </div>
          {items.length < total && (
            <div className="text-center">
              <button onClick={() => load(items.length)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Show more ({total - items.length} left)</button>
            </div>
          )}
        </>
      )}

      {selected && (
        <Detail item={selected} person={person} showSpokesperson={!hospitality} onClose={() => setSelected(null)}
          onSave={save} onRemove={remove} onRetag={(i) => tagNow([i.id])}
          onReview={view === "pending" ? review : undefined} />
      )}
    </div>
  );
}

export function BankTile({ item, onClick, badge, actions }: {
  item: BankItem;
  onClick: () => void;
  badge?: string;
  actions?: { approve: () => void; reject: () => void };
}) {
  const label = item.scene_label || item.original_filename || "Untitled";
  const readable = item.tags.filter((t) => t.includes(":")).map(readableTag).slice(0, 3).join(", ");
  return (
    <div className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left hover:border-violet-400">
      <button onClick={onClick} className="block w-full text-left" aria-label={`Open ${label}`}>
        <div className="relative aspect-square bg-gray-100">
          {item.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumb_url} alt={item.scene_label || ""} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-gray-500">Preparing preview</span>
          )}
          {item.kind === "video" && <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : "Video"}</span>}
          {(badge || item.last_used_at) && <span className="absolute left-1.5 top-1.5 rounded bg-emerald-700 px-1.5 py-0.5 text-xs text-white">{badge || "Used"}</span>}
        </div>
        <div className="px-2 py-1.5">
          <p className="truncate text-xs font-medium text-gray-800">{label}</p>
          <p className="truncate text-xs text-gray-600">{readable || (item.auto_tagged_at ? "No tags" : "Tagging soon")}</p>
        </div>
      </button>
      {actions && (
        <div className="flex gap-1 border-t border-gray-100 p-1.5">
          <button onClick={actions.approve} className="flex-1 rounded bg-emerald-600 py-1 text-xs font-medium text-white hover:bg-emerald-700">Approve</button>
          <button onClick={actions.reject} className="flex-1 rounded border border-red-200 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reject</button>
        </div>
      )}
    </div>
  );
}

function Detail({ item, person, showSpokesperson, onClose, onSave, onRemove, onRetag, onReview }: {
  item: BankItem; person: string; showSpokesperson: boolean; onClose: () => void;
  onSave: (i: BankItem, c: Partial<BankItem>) => void; onRemove: (i: BankItem) => void;
  onRetag: (i: BankItem) => void;
  onReview?: (ids: string[], d: "approve" | "reject") => void;
}) {
  const [label, setLabel] = useState(item.scene_label || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // The original is only fetched when someone asks for it.
  async function openOriginal() {
    setOpening(true);
    const res = await fetch(`/api/bank/${item.id}/original`);
    const data = await res.json().catch(() => ({}));
    setOpening(false);
    if (res.ok) setOriginalUrl(data.url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Photo details">
      <div className="grid max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col bg-gray-900">
          <div className="flex min-h-[240px] flex-1 items-center justify-center">
            {originalUrl ? (
              item.kind === "video"
                ? <video src={originalUrl} controls autoPlay playsInline className="max-h-[70vh] w-full object-contain" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={originalUrl} alt={label} className="max-h-[70vh] w-full object-contain" />
            ) : item.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumb_url} alt={label} className="max-h-[70vh] w-full object-contain" />
            ) : <p className="text-sm text-gray-300">No preview yet</p>}
          </div>
          {!originalUrl && (
            <button onClick={openOriginal} disabled={opening} className="m-3 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50">
              {opening ? "Opening..." : item.kind === "video" ? "Play the video" : "View full size"}
            </button>
          )}
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold text-gray-900">{item.original_filename}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800">Close</button>
          </div>
          <p className="text-xs text-gray-500">
            {item.kind === "video" ? `Video${item.duration_seconds ? `, ${Math.round(item.duration_seconds)} seconds` : ""}` : "Photo"}
            {item.width && item.height ? `, ${item.width} x ${item.height}` : ""}
            {item.size_bytes ? `, ${formatBytes(item.size_bytes)}` : ""}
            {`, added ${new Date(item.added_at).toLocaleDateString("en-GB")}`}
            {item.submitted_by ? ` by ${item.submitted_by}` : ""}
            {item.last_used_at ? `, last used ${new Date(item.last_used_at).toLocaleDateString("en-GB")}` : ", not used yet"}
          </p>

          {onReview && (
            <div className="flex gap-2">
              <button onClick={() => onReview([item.id], "approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Approve</button>
              <button onClick={() => onReview([item.id], "reject")} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Reject and delete</button>
            </div>
          )}

          {item.auto_tag_error && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The automatic tags did not work for this one. Tap the tags below, or <button onClick={() => onRetag(item)} className="font-medium underline">try again</button>.
            </p>
          )}

          <TagEditor tags={item.tags} onChange={(next) => onSave(item, { tags: next })} />

          <label className="block">
            <span className="text-xs font-medium text-gray-700">What it shows</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (item.scene_label || "") && onSave(item, { scene_label: label || null })} placeholder="One short sentence" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!item.people_present} onChange={(e) => onSave(item, { people_present: e.target.checked })} />
            <span>A person can be seen in it</span>
          </label>
          {showSpokesperson && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={item.shows_spokesperson} onChange={(e) => onSave(item, { shows_spokesperson: e.target.checked })} />
              <span>Shows {person}</span>
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={item.text_space} onChange={(e) => onSave(item, { text_space: e.target.checked })} />
            <span>Has room for words on it</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes || "") && onSave(item, { notes: notes || null })} rows={2} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <p className="text-xs text-gray-500">To put this on a post, open the post and choose &quot;Choose from library&quot;.</p>
          {!onReview && <button onClick={() => onRemove(item)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">Remove from the library</button>}
        </div>
      </div>
    </div>
  );
}
