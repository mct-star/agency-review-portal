"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDirectUpload } from "@/lib/upload/use-direct-upload";
import { PHOTO_MIME_TYPES, VIDEO_MIME_TYPES, type MediaKind } from "@/lib/upload/media-constants";

export interface BankItem {
  id: string;
  kind: MediaKind;
  view_url: string | null;
  original_filename: string | null;
  scene_label: string | null;
  tags: string[];
  shows_spokesperson: boolean;
  text_space: boolean;
  notes: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  added_at: string;
  last_used_at: string | null;
}

interface UploadRow { id: string; name: string; progress: number; status: "uploading" | "done" | "exists" | "error"; error?: string }

/** Real photos and footage, uploaded once and reused across posts. */
export default function MediaBank({ companies, initialCompanyId }: {
  companies: Array<{ id: string; name: string; spokesperson_name: string | null }>;
  initialCompanyId: string;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [kind, setKind] = useState<"all" | MediaKind>("all");
  const [tag, setTag] = useState<string>("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<BankItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<BankItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useDirectUpload();
  const person = companies.find((c) => c.id === companyId)?.spokesperson_name || "the spokesperson";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ companyId });
    if (kind !== "all") params.set("kind", kind);
    if (tag) params.set("tag", tag);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/bank?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || `Could not load the bank (${res.status})`);
    else { setItems(data.data || []); setAllTags(data.tags || []); }
    setLoading(false);
  }, [companyId, kind, tag, q]);

  useEffect(() => { load(); }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const rowId = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const fileKind: MediaKind | null = PHOTO_MIME_TYPES.includes(file.type) ? "photo" : VIDEO_MIME_TYPES.includes(file.type) ? "video" : null;
      if (!fileKind) {
        setUploads((u) => [...u, { id: rowId, name: file.name, progress: 0, status: "error", error: "Not a JPEG, PNG, WebP, MP4, MOV or WebM file" }]);
        continue;
      }
      setUploads((u) => [...u, { id: rowId, name: file.name, progress: 0, status: "uploading" }]);
      const patch = (p: Partial<UploadRow>) => setUploads((u) => u.map((r) => (r.id === rowId ? { ...r, ...p } : r)));
      try {
        const dims = await readDimensions(file, fileKind);
        const uploaded = await uploadFile(file, { companyId, kind: fileKind, onProgress: (f) => patch({ progress: f }) });
        const res = await fetch("/api/media/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId, kind: fileKind, bucket: uploaded.bucket, path: uploaded.path, mimeType: file.type,
            sizeBytes: file.size, originalFilename: file.name, sha256: uploaded.sha256,
            width: dims.width, height: dims.height, durationSeconds: dims.duration, weekNumber: null,
            target: { type: "photo_bank", source: "bank_upload" },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed");
        patch({ status: data.alreadyExists ? "exists" : "done", progress: 1 });
      } catch (err) {
        patch({ status: "error", error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
    load();
  }

  async function save(item: BankItem, change: Partial<BankItem>) {
    const res = await fetch(`/api/bank/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Not saved"); return; }
    const next = { ...item, ...change };
    setItems((all) => all.map((i) => (i.id === item.id ? next : i)));
    setSelected(next);
    if (change.tags) setAllTags((t) => [...new Set([...t, ...change.tags!])].sort());
  }

  async function remove(item: BankItem) {
    if (!window.confirm(`Remove ${item.original_filename || "this file"} from the bank? Posts that already use it keep their copy.`)) return;
    const res = await fetch(`/api/bank/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Not removed"); return; }
    setItems((all) => all.filter((i) => i.id !== item.id));
    setSelected(null);
  }

  const photos = items.filter((i) => i.kind === "photo").length;
  const videos = items.length - photos;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Photo and video bank</h1>
          <p className="mt-1 text-sm text-gray-500">Real photos and footage, uploaded once and reused on posts. {photos} photos, {videos} videos.</p>
        </div>
        {companies.length > 1 && (
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setTag(""); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={`rounded-lg border-2 border-dashed p-6 text-center ${dragging ? "border-violet-500 bg-violet-50" : "border-gray-300 bg-white"}`}
      >
        <p className="text-sm text-gray-700">Drop photos or videos here, or</p>
        <button onClick={() => inputRef.current?.click()} className="mt-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">Choose files</button>
        <p className="mt-2 text-xs text-gray-400">JPEG, PNG or WebP photos up to 25 MB. MP4, MOV or WebM video up to 2 GB. Duplicates are recognised and kept once.</p>
        <input ref={inputRef} type="file" multiple accept={[...PHOTO_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",")} className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        {uploads.length > 0 && (
          <ul className="mx-auto mt-4 max-w-xl space-y-1 text-left text-xs">
            {uploads.slice(-8).map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-gray-700">{u.name}</span>
                <span className={u.status === "error" ? "text-red-600" : u.status === "uploading" ? "text-gray-500" : "text-emerald-600"}>
                  {u.status === "uploading" ? `${Math.round(u.progress * 100)}%` : u.status === "done" ? "Added" : u.status === "exists" ? "Already in the bank" : u.error}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["all", "photo", "video"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-700"}`}>
            {k === "all" ? "All" : k === "photo" ? "Photos" : "Videos"}
          </button>
        ))}
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm">
          <option value="">Any tag</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search labels and notes" className="min-w-[200px] flex-1 rounded-md border border-gray-200 px-3 py-1 text-sm" />
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading...</p> : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">Nothing here yet. Drop in photos and clips of {person}.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => <BankTile key={it.id} item={it} onClick={() => setSelected(it)} />)}
        </div>
      )}

      {selected && <Detail item={selected} person={person} onClose={() => setSelected(null)} onSave={save} onRemove={remove} />}
    </div>
  );
}

export function BankTile({ item, onClick, badge }: { item: BankItem; onClick: () => void; badge?: string }) {
  return (
    <button onClick={onClick} className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left hover:border-violet-400">
      <div className="relative aspect-square bg-gray-100">
        {item.view_url && (item.kind === "video"
          ? <video src={`${item.view_url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          : <img src={item.view_url} alt={item.scene_label || ""} className="h-full w-full object-cover" loading="lazy" />)}
        {item.kind === "video" && <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : "Video"}</span>}
        {(badge || item.last_used_at) && <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] text-white">{badge || "Used"}</span>}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium text-gray-800">{item.scene_label || item.original_filename || "Untitled"}</p>
        <p className="truncate text-[11px] text-gray-500">{item.tags.join(", ") || "No tags"}</p>
      </div>
    </button>
  );
}

function Detail({ item, person, onClose, onSave, onRemove }: {
  item: BankItem; person: string; onClose: () => void;
  onSave: (i: BankItem, c: Partial<BankItem>) => void; onRemove: (i: BankItem) => void;
}) {
  const [label, setLabel] = useState(item.scene_label || "");
  const [tagText, setTagText] = useState(item.tags.join(", "));
  const [notes, setNotes] = useState(item.notes || "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="grid max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gray-900">
          {item.view_url && (item.kind === "video"
            ? <video src={item.view_url} controls playsInline className="h-full w-full object-contain" />
            : <img src={item.view_url} alt={label} className="h-full w-full object-contain" />)}
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold text-gray-900">{item.original_filename}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">Close</button>
          </div>
          <p className="text-xs text-gray-500">
            {item.kind === "video" ? `Video${item.duration_seconds ? `, ${Math.round(item.duration_seconds)} seconds` : ""}` : "Photo"}
            {item.width && item.height ? `, ${item.width} x ${item.height}` : ""}
            {`, added ${new Date(item.added_at).toLocaleDateString("en-GB")}`}
            {item.last_used_at ? `, last used ${new Date(item.last_used_at).toLocaleDateString("en-GB")}` : ", not used yet"}
          </p>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">What it shows</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (item.scene_label || "") && onSave(item, { scene_label: label || null })} placeholder="e.g. Speaking at a summit, pointing to the screen" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Tags, comma separated</span>
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} onBlur={() => onSave(item, { tags: tagText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) })} placeholder="speaking, smiling, office, event, outdoors" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={item.shows_spokesperson} onChange={(e) => onSave(item, { shows_spokesperson: e.target.checked })} />
            <span>Shows {person}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={item.text_space} onChange={(e) => onSave(item, { text_space: e.target.checked })} />
            <span>Has space for text on it</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes || "") && onSave(item, { notes: notes || null })} rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <p className="text-xs text-gray-500">To put this on a post, open the post and choose &quot;Choose from bank&quot;.</p>
          <button onClick={() => onRemove(item)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">Remove from bank</button>
        </div>
      </div>
    </div>
  );
}

/** Width and height (and video length) read in the browser before upload. */
function readDimensions(file: File, kind: MediaKind): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (v: { width: number | null; height: number | null; duration: number | null }) => { URL.revokeObjectURL(url); resolve(v); };
    if (kind === "photo") {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight, duration: null });
      img.onerror = () => done({ width: null, height: null, duration: null });
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done({ width: v.videoWidth || null, height: v.videoHeight || null, duration: Number.isFinite(v.duration) ? v.duration : null });
      v.onerror = () => done({ width: null, height: null, duration: null });
      v.src = url;
    }
  });
}
