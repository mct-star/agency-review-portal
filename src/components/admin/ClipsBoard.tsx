"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WEEK_BOARD_POLL_INTERVAL_MS } from "@/lib/constants/week-board";
import type { ClipCard, SelectableWeek } from "@/lib/clips/board-data";
import type { JobStatus } from "@/types/database";
import { useDirectUpload } from "@/lib/upload/use-direct-upload";
import { VIDEO_MIME_TYPES, MAX_VIDEO_BYTES } from "@/lib/upload/media-constants";

interface ClipsBoardProps {
  initialClips: ClipCard[];
  initialWeeks: SelectableWeek[];
}

/** Job statuses where a mac_engine render is actively occupying the
 * per-piece single-flight slot (content_generation_jobs_piece_video_active_uniq). */
const ACTIVE_JOB_STATUSES: JobStatus[] = ["queued", "running"];

interface StatusMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
}

const JOB_STATUS_META: Record<JobStatus, StatusMeta> = {
  queued: { label: "Queued", badgeClass: "bg-blue-50 text-blue-700", dotClass: "bg-blue-500" },
  running: {
    label: "Running",
    badgeClass: "bg-amber-50 text-amber-800",
    dotClass: "bg-amber-500 animate-pulse",
  },
  completed: { label: "Complete", badgeClass: "bg-emerald-50 text-emerald-700", dotClass: "bg-emerald-500" },
  failed: { label: "Failed", badgeClass: "bg-red-50 text-red-700", dotClass: "bg-red-500" },
  cancelled: { label: "Cancelled", badgeClass: "bg-gray-100 text-gray-500", dotClass: "bg-gray-400" },
};

const NOT_PROCESSED_META: StatusMeta = {
  label: "Not processed",
  badgeClass: "bg-gray-100 text-gray-400",
  dotClass: "bg-gray-300",
};

function weekLabel(piece: ClipCard["piece"]): string {
  const company = piece.company_name || "Unknown company";
  const week = piece.week_number !== null ? `Week ${piece.week_number}` : "No week";
  return `${company} · ${week}`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Never run";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClipsBoard({ initialClips, initialWeeks }: ClipsBoardProps) {
  const [clips, setClips] = useState<ClipCard[]>(initialClips);
  const [weeks] = useState<SelectableWeek[]>(initialWeeks);
  const [pendingPieceId, setPendingPieceId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clips");
      const json = await res.json();
      if (!res.ok) {
        setListError(json.error || "Failed to refresh clips");
        return;
      }
      setListError(null);
      setClips(json.data || []);
    } catch {
      setListError("Failed to refresh clips");
    }
  }, []);

  // Poll only while at least one clip has a job actively occupying its
  // single-flight slot. Recursive setTimeout, same idiom as WeekBoard,
  // so a slow request never overlaps the next tick and polling stops
  // cleanly once nothing is active.
  const scheduleNextPoll = useCallback(() => {
    const hasActive = clipsRef.current.some(
      (c) => c.latestJob && ACTIVE_JOB_STATUSES.includes(c.latestJob.status)
    );
    if (!hasActive) return;
    pollTimeoutRef.current = setTimeout(async () => {
      await refresh();
      scheduleNextPoll();
    }, WEEK_BOARD_POLL_INTERVAL_MS);
  }, [refresh]);

  useEffect(() => {
    scheduleNextPoll();
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
    // Only re-arm on mount; scheduleNextPoll reads live state via clipsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleProcess(pieceId: string) {
    setPendingPieceId(pieceId);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[pieceId];
      return next;
    });

    try {
      const res = await fetch("/api/admin/clips/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPieceId: pieceId }),
      });
      const json = await res.json();

      if (!res.ok) {
        setCardErrors((prev) => ({ ...prev, [pieceId]: json.error || "Failed to queue render" }));
        if (res.status === 409) await refresh();
        return;
      }

      // Optimistic merge so the badge flips to Queued immediately; the
      // poll loop armed below fills in real progress once the Mac
      // worker picks the job up.
      setClips((prev) =>
        prev.map((c) =>
          c.piece.id === pieceId
            ? {
                ...c,
                latestJob: {
                  id: json.job.id,
                  status: json.job.status as JobStatus,
                  progress: 0,
                  error_message: null,
                  output_payload: {},
                  updated_at: new Date().toISOString(),
                },
              }
            : c
        )
      );
      scheduleNextPoll();
    } catch {
      setCardErrors((prev) => ({ ...prev, [pieceId]: "Failed to queue render" }));
    } finally {
      setPendingPieceId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clips</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a phone clip, then render it into a captioned vertical post.
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Refresh now
        </button>
      </div>

      <ClipUploader weeks={weeks} onUploaded={refresh} />

      {listError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {listError}
        </div>
      )}

      {clips.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No clips yet. Upload one above to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {clips.map((clip) => (
            <ClipCardView
              key={clip.piece.id}
              clip={clip}
              pending={pendingPieceId === clip.piece.id}
              errorMessage={cardErrors[clip.piece.id]}
              onProcess={handleProcess}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ClipCardViewProps {
  clip: ClipCard;
  pending: boolean;
  errorMessage?: string;
  onProcess: (pieceId: string) => void;
}

function ClipCardView({ clip, pending, errorMessage, onProcess }: ClipCardViewProps) {
  const { piece, rawAsset, latestJob, renders } = clip;
  const isActive = Boolean(latestJob && ACTIVE_JOB_STATUSES.includes(latestJob.status));
  const meta = latestJob ? JOB_STATUS_META[latestJob.status] : NOT_PROCESSED_META;
  const primaryRender = renders.find((r) => r.aspect === "9x16") ?? renders[0] ?? null;

  const buttonDisabled = pending || isActive || !rawAsset;
  const buttonLabel = pending
    ? "Queuing…"
    : latestJob?.status === "failed"
    ? "Retry"
    : renders.length > 0
    ? "Re-render"
    : "Process";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {weekLabel(piece)}
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-gray-900">{piece.title}</h2>
          {rawAsset && (
            <p className="mt-0.5 text-xs text-gray-500">
              {rawAsset.originalFilename || "Uploaded clip"}
              {rawAsset.sizeBytes !== null ? ` · ${formatBytes(rawAsset.sizeBytes)}` : ""}
            </p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
          {meta.label}
        </span>
      </div>

      {isActive && latestJob && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.max(4, latestJob.progress)}%` }}
            />
          </div>
          <p className="text-xs text-amber-800">{meta.label}, {latestJob.progress}%</p>
        </div>
      )}

      {latestJob?.status === "failed" && latestJob.error_message && (
        <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {latestJob.error_message}
        </p>
      )}

      {errorMessage && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{errorMessage}</p>
      )}

      {!rawAsset && (
        <p className="text-xs text-gray-400">No clip uploaded yet.</p>
      )}

      {primaryRender && (
        <div className="space-y-2">
          <video
            controls
            playsInline
            preload="metadata"
            poster={primaryRender.thumbnailUrl ?? undefined}
            src={primaryRender.file_url}
            className="w-full max-w-[220px] rounded-md bg-black"
          />
          <div className="space-y-1.5">
            {renders.map((r) => (
              <div key={r.aspect} className="rounded-md border border-gray-100 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-gray-600">{r.aspect}</span>
                  <div className="flex items-center gap-2">
                    {r.verify && (
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          r.verify.passed
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {r.verify.passed ? "Verified" : "Verify failed"}
                      </span>
                    )}
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-sky-700 hover:text-sky-900 hover:underline"
                    >
                      Download
                    </a>
                  </div>
                </div>
                {r.verify && !r.verify.passed && r.verify.failures.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-red-600">
                    {r.verify.failures.map((failure, i) => (
                      <li key={i}>{failure}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-gray-400">{formatTimestamp(latestJob?.updated_at ?? null)}</span>
        <button
          onClick={() => onProcess(piece.id)}
          disabled={buttonDisabled}
          title={!rawAsset ? "Upload a clip before processing" : undefined}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

interface ClipUploaderProps {
  weeks: SelectableWeek[];
  onUploaded: () => void;
}

type UploadPhase = "idle" | "uploading" | "registering" | "done" | "error";

/**
 * Week selector plus a single-file phone clip drop zone. One upload at
 * a time, tracked with useDirectUpload's own status/progress rather
 * than the multi-item queue WeekCardPhotoDropzone needs for photos,
 * since a clip upload is a much rarer, heavier action.
 */
function ClipUploader({ weeks, onUploaded }: ClipUploaderProps) {
  const { uploadFile, status } = useDirectUpload();
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [percent, setPercent] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedWeek = weeks.find((w) => w.id === selectedWeekId) ?? null;
  const busy = phase === "uploading" || phase === "registering";

  async function handleFile(file: File) {
    if (!selectedWeek) {
      setError("Choose a week first.");
      return;
    }
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      setError("Videos only: MP4, MOV or WebM.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(
        `Too large (${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB). Max ${(
          MAX_VIDEO_BYTES /
          1024 /
          1024 /
          1024
        ).toFixed(0)} GB.`
      );
      return;
    }

    setError(null);
    setFileName(file.name);
    setPercent(0);
    setPhase("uploading");

    try {
      const uploaded = await uploadFile(file, {
        companyId: selectedWeek.company_id,
        kind: "video",
        onProgress: (fraction) => setPercent(Math.round(fraction * 100)),
      });

      setPhase("registering");
      const res = await fetch("/api/media/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedWeek.company_id,
          kind: "video",
          bucket: uploaded.bucket,
          path: uploaded.path,
          mimeType: file.type,
          sizeBytes: file.size,
          originalFilename: file.name,
          sha256: uploaded.sha256,
          width: null,
          height: null,
          durationSeconds: null,
          weekNumber: null,
          target: { type: "week_clip", weekId: selectedWeek.id },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      setPhase("done");
      onUploaded();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const phaseLabel =
    phase === "uploading"
      ? status === "hashing"
        ? "Preparing…"
        : status === "signing"
        ? "Getting an upload slot…"
        : `Uploading… ${percent}%`
      : phase === "registering"
      ? "Finishing up…"
      : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <label className="block text-xs font-medium text-gray-500">Week</label>
      <select
        value={selectedWeekId}
        onChange={(e) => setSelectedWeekId(e.target.value)}
        disabled={busy}
        className="mt-1 block w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none disabled:bg-gray-50"
      >
        <option value="">Select a week</option>
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>
            {w.company_name || "Unknown company"} · Week {w.week_number}
            {w.title ? ` (${w.title})` : ""}
          </option>
        ))}
      </select>

      <div
        onClick={() => selectedWeek && !busy && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (selectedWeek && !busy) setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          if (!selectedWeek || busy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`mt-3 rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors ${
          !selectedWeek || busy
            ? "cursor-not-allowed border-gray-100 text-gray-300"
            : isDraggingOver
            ? "cursor-pointer border-violet-400 bg-violet-50 text-violet-700"
            : "cursor-pointer border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={VIDEO_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        {!selectedWeek
          ? "Choose a week above, then drop a clip here"
          : busy
          ? phaseLabel
          : "Drop a phone clip here, or click to choose one"}
      </div>

      {busy && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${phase === "uploading" ? percent : 100}%` }}
          />
        </div>
      )}

      {fileName && phase === "done" && (
        <p className="mt-2 text-xs text-emerald-600">Uploaded {fileName}.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
