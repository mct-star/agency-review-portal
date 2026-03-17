"use client";

import { useState, useEffect, useRef } from "react";

interface Company {
  id: string;
  name: string;
}

interface ContentPiece {
  id: string;
  title: string;
  content_type: string;
  week_id: string;
}

interface BrollSuggestion {
  startSeconds: number;
  endSeconds: number;
  type: string;
  description: string;
  suggestedPrompt: string;
}

type PipelineStep = "upload" | "transcribe" | "broll" | "render";

interface StepStatus {
  status: "idle" | "running" | "done" | "error";
  message?: string;
  result?: Record<string, unknown>;
}

const STEPS: { id: PipelineStep; label: string; description: string }[] = [
  { id: "upload", label: "Upload Video", description: "Upload your raw talking-head MP4" },
  { id: "transcribe", label: "Transcribe", description: "Generate transcript with timestamps" },
  { id: "broll", label: "B-Roll Analysis", description: "AI identifies cut points for visuals" },
  { id: "render", label: "Render", description: "Composite final video with B-roll" },
];

export default function VideoProductionPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [pieces, setPieces] = useState<ContentPiece[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [brollSuggestions, setBrollSuggestions] = useState<BrollSuggestion[]>([]);

  const [steps, setSteps] = useState<Record<PipelineStep, StepStatus>>({
    upload: { status: "idle" },
    transcribe: { status: "idle" },
    broll: { status: "idle" },
    render: { status: "idle" },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch companies
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.data || []));
  }, []);

  // Fetch video_script content pieces for selected company
  useEffect(() => {
    if (!selectedCompanyId) return;
    fetch(`/api/weeks?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then(async (weeksData) => {
        const weeks = weeksData.data || [];
        const weekIds = weeks.map((w: { id: string }) => w.id);
        if (weekIds.length === 0) return;

        // Fetch content pieces for these weeks
        const piecesPromises = weekIds.map((wid: string) =>
          fetch(`/api/weeks?weekId=${wid}&pieces=true`)
            .then((r) => r.json())
            .then((d) => d.data?.content_pieces || [])
        );

        const allPiecesArrays = await Promise.all(piecesPromises);
        const allPieces = allPiecesArrays
          .flat()
          .filter((p: ContentPiece) => p.content_type === "video_script");
        setPieces(allPieces);
      });
  }, [selectedCompanyId]);

  const updateStep = (step: PipelineStep, update: StepStatus) => {
    setSteps((prev) => ({ ...prev, [step]: update }));
  };

  // ── Step 1: Upload ─────────────────────────────────────────
  const handleUpload = async (file: File) => {
    updateStep("upload", { status: "running", message: "Uploading..." });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", selectedCompanyId);
    if (selectedPieceId) formData.append("contentPieceId", selectedPieceId);

    try {
      const res = await fetch("/api/upload/video", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setVideoUrl(data.url);
      updateStep("upload", {
        status: "done",
        message: `Uploaded: ${data.filename} (${(data.sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
        result: data,
      });
    } catch (err) {
      updateStep("upload", {
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  };

  // ── Step 2: Transcribe ─────────────────────────────────────
  const handleTranscribe = async () => {
    if (!videoUrl || !selectedPieceId) return;
    updateStep("transcribe", { status: "running", message: "Transcribing with Whisper..." });

    try {
      const res = await fetch("/api/generate/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          contentPieceId: selectedPieceId,
          mediaUrl: videoUrl,
          includeTimestamps: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateStep("transcribe", {
        status: "done",
        message: `${data.wordCount} words, ${data.segmentCount} segments, ${Math.round(data.durationSeconds)}s`,
        result: data,
      });
    } catch (err) {
      updateStep("transcribe", {
        status: "error",
        message: err instanceof Error ? err.message : "Transcription failed",
      });
    }
  };

  // ── Step 3: B-Roll Analysis ────────────────────────────────
  const handleBrollAnalysis = async () => {
    if (!selectedPieceId) return;
    updateStep("broll", { status: "running", message: "Analyzing transcript for cut points..." });

    try {
      const res = await fetch("/api/generate/broll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          contentPieceId: selectedPieceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBrollSuggestions(data.suggestions || []);
      updateStep("broll", {
        status: "done",
        message: `${data.count} B-roll cut points identified`,
        result: data,
      });
    } catch (err) {
      updateStep("broll", {
        status: "error",
        message: err instanceof Error ? err.message : "B-roll analysis failed",
      });
    }
  };

  // ── Step 4: Render ─────────────────────────────────────────
  const handleRender = async () => {
    if (!selectedPieceId) return;
    updateStep("render", { status: "running", message: "Rendering video with Shotstack..." });

    try {
      const res = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          contentPieceId: selectedPieceId,
          aspectRatio: "16:9",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateStep("render", {
        status: "done",
        message: `Video ready: ${data.durationSeconds}s`,
        result: data,
      });
    } catch (err) {
      updateStep("render", {
        status: "error",
        message: err instanceof Error ? err.message : "Render failed",
      });
    }
  };

  const stepActions: Record<PipelineStep, () => void> = {
    upload: () => fileInputRef.current?.click(),
    transcribe: handleTranscribe,
    broll: handleBrollAnalysis,
    render: handleRender,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Video Production</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload → Transcribe → B-Roll Analysis → Composite Render
        </p>
      </div>

      {/* Company + Piece Selection */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Company</label>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none"
          >
            <option value="">Select company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Video Script Piece
          </label>
          <select
            value={selectedPieceId}
            onChange={(e) => setSelectedPieceId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none"
            disabled={!selectedCompanyId}
          >
            <option value="">Select content piece</option>
            {pieces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            {selectedCompanyId && pieces.length === 0 && (
              <option disabled>No video scripts found</option>
            )}
          </select>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />

      {/* Pipeline Steps */}
      <div className="space-y-3">
        {STEPS.map((step, index) => {
          const stepStatus = steps[step.id];
          const isDisabled =
            !selectedCompanyId ||
            (step.id !== "upload" && !selectedPieceId) ||
            (step.id === "transcribe" && steps.upload.status !== "done") ||
            (step.id === "broll" && steps.transcribe.status !== "done") ||
            (step.id === "render" && steps.broll.status !== "done");

          return (
            <div
              key={step.id}
              className={`rounded-lg border p-4 transition-colors ${
                stepStatus.status === "done"
                  ? "border-green-200 bg-green-50"
                  : stepStatus.status === "running"
                  ? "border-sky-200 bg-sky-50"
                  : stepStatus.status === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Step number */}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      stepStatus.status === "done"
                        ? "bg-green-500 text-white"
                        : stepStatus.status === "running"
                        ? "bg-sky-500 text-white"
                        : stepStatus.status === "error"
                        ? "bg-red-500 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {stepStatus.status === "done" ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : stepStatus.status === "running" ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{step.label}</h3>
                    <p className="text-xs text-gray-500">
                      {stepStatus.message || step.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={stepActions[step.id]}
                  disabled={isDisabled || stepStatus.status === "running"}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isDisabled || stepStatus.status === "running"
                      ? "cursor-not-allowed bg-gray-100 text-gray-400"
                      : stepStatus.status === "done"
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-sky-600 text-white hover:bg-sky-700"
                  }`}
                >
                  {stepStatus.status === "done"
                    ? "Re-run"
                    : stepStatus.status === "running"
                    ? "Running..."
                    : step.id === "upload"
                    ? "Choose File"
                    : "Start"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* B-Roll Suggestions */}
      {brollSuggestions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              B-Roll Cut Points ({brollSuggestions.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {brollSuggestions.map((s, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                    {formatTime(s.startSeconds)}-{formatTime(s.endSeconds)}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      s.type === "image"
                        ? "bg-purple-100 text-purple-600"
                        : s.type === "text_overlay"
                        ? "bg-amber-100 text-amber-600"
                        : s.type === "screen_recording"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {s.type.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{s.description}</p>
                {s.suggestedPrompt && (
                  <p className="mt-1 text-xs text-gray-400 italic">
                    Prompt: {s.suggestedPrompt}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Video */}
      {steps.render.status === "done" && !!steps.render.result?.videoUrl && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="text-sm font-semibold text-green-800">Video Ready</h3>
          <a
            href={steps.render.result.videoUrl as string}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-green-700 underline hover:text-green-800"
          >
            Download rendered video
          </a>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
