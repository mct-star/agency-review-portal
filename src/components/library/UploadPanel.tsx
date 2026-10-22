"use client";

import { useRef, useState } from "react";
import { useBulkUpload } from "@/lib/upload/use-bulk-upload";
import { collectFromDrop, collectFromInput } from "@/lib/upload/collect-files";
import type { QueueItem } from "@/lib/upload/upload-queue";

const STATUS_TEXT: Record<QueueItem["status"], string> = {
  queued: "Waiting",
  preparing: "Getting ready",
  uploading: "Uploading",
  saving: "Saving",
  done: "Added",
  exists: "Already in the library",
  error: "Did not upload",
};

/**
 * Drop a whole folder (desktop), or choose several photos at once (phone),
 * and watch each file go in. A file that fails can be retried on its own.
 */
export default function UploadPanel({ companyId, onLanded }: { companyId: string; onLanded: () => void }) {
  const { items, summary, addFiles, retry, retryAll, clearFinished } = useBulkUpload(
    {
      signUrl: "/api/upload/sign",
      registerUrl: "/api/media/register",
      body: { companyId },
      registerBody: { target: { type: "photo_bank", source: "bank_upload" } },
      allowVideo: true,
    },
    onLanded
  );
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.filter((i) => i.status !== "done" && i.status !== "exists").slice(0, 12);
  const working = summary.active > 0;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(await collectFromDrop(e.dataTransfer));
      }}
      className={`rounded-lg border-2 border-dashed p-5 ${dragging ? "border-violet-500 bg-violet-50" : "border-gray-300 bg-white"}`}
    >
      <div className="text-center">
        <p className="text-sm font-medium text-gray-800">Add photos and videos</p>
        <p className="mt-1 text-xs text-gray-500">Drop a folder or a handful of files here. On a phone, tap below and pick as many as you like.</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => filesRef.current?.click()} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
            Choose photos or videos
          </button>
          <button type="button" onClick={() => folderRef.current?.click()} className="hidden rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 md:inline-block">
            Choose a folder
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          iPhone photos (HEIC) are converted for you. Photos up to 25 MB, videos up to 2 GB. A photo you have already added is skipped.
        </p>
        <input ref={filesRef} type="file" multiple accept="image/*,video/*,.heic,.heif" className="hidden"
          onChange={(e) => { addFiles(collectFromInput(e.target.files)); e.target.value = ""; }} />
        <input ref={folderRef} type="file" multiple className="hidden"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => { addFiles(collectFromInput(e.target.files)); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <div className="mx-auto mt-4 max-w-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600" aria-live="polite">
            <span>
              {summary.done} added
              {summary.exists > 0 && `, ${summary.exists} already in the library`}
              {summary.error > 0 && `, ${summary.error} did not upload`}
              {working && `, ${summary.active} still going`}
            </span>
            <span className="flex gap-3">
              {summary.error > 0 && <button type="button" onClick={retryAll} className="font-medium text-violet-700 hover:underline">Retry the ones that failed</button>}
              {!working && <button type="button" onClick={clearFinished} className="text-gray-500 hover:underline">Clear finished</button>}
              {items.length > visible.length && <button type="button" onClick={() => setShowAll((v) => !v)} className="text-gray-500 hover:underline">{showAll ? "Show fewer" : "Show all"}</button>}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {visible.map((u) => (
              <li key={u.id} className="rounded-md bg-gray-50 px-3 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-gray-800">{u.name}</span>
                  <span className={u.status === "error" ? "text-red-600" : u.status === "done" || u.status === "exists" ? "text-emerald-600" : "text-gray-500"}>
                    {u.status === "uploading" ? `${Math.round(u.progress * 100)}%` : u.message || STATUS_TEXT[u.status]}
                  </span>
                </div>
                {u.status === "uploading" && (
                  <div className="mt-1 h-1 overflow-hidden rounded bg-gray-200"><div className="h-full bg-violet-500" style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>
                )}
                {u.status === "error" && (
                  <div className="mt-1 flex items-center justify-between gap-3 text-red-600">
                    <span>{u.error}</span>
                    <button type="button" onClick={() => retry(u.id)} className="shrink-0 font-medium text-violet-700 hover:underline">Retry</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
