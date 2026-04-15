"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import LinkedInPreview from "@/components/content/LinkedInPreview";

// ── Types ────────────────────────────────────────────────────

interface CompanyOption {
  id: string;
  name: string;
  authorName: string;
  authorTagline: string;
  brandColor: string;
  profilePictureUrl?: string | null;
}

interface SpokespersonOption {
  id: string;
  companyId: string;
  name: string;
  tagline: string;
  profilePictureUrl: string | null;
  isPrimary: boolean;
}

interface VoiceToPostPageProps {
  companies: CompanyOption[];
  spokespersons?: SpokespersonOption[];
  showCompanyPicker?: boolean;
}

type FlowState = "record" | "processing" | "result";

interface GeneratedPost {
  postText: string;
  transcription: string;
  postType: string;
  imagePrompt: string | null;
}

// ── Constants ────────────────────────────────────────────────

const MAX_DURATION_SECONDS = 120; // 2 minutes

// ── Component ────────────────────────────────────────────────

export default function VoiceToPostPage({
  companies,
  spokespersons = [],
  showCompanyPicker = false,
}: VoiceToPostPageProps) {
  // Company / spokesperson selection
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption>(companies[0]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>("record");
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  // Refs for recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Filtered spokespersons for selected company
  const companySpokespersons = spokespersons.filter(
    (s) => s.companyId === selectedCompany.id
  );

  // Active spokesperson details
  const activePerson = selectedPersonId
    ? spokespersons.find((s) => s.id === selectedPersonId) || null
    : null;
  const authorName = activePerson?.name || selectedCompany.authorName;
  const authorTagline = activePerson?.tagline || selectedCompany.authorTagline;
  const authorAvatar = activePerson?.profilePictureUrl || selectedCompany.profilePictureUrl || undefined;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Auto-stop at max duration
  useEffect(() => {
    if (isRecording && elapsed >= MAX_DURATION_SECONDS) {
      stopRecording();
    }
  }, [elapsed, isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording handlers ──────────────────────────────────────

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stream cleanup
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(250); // Collect data every 250ms
      setIsRecording(true);
      setElapsed(0);

      // Start timer
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
    }
  }, []);

  const stopRecording = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    // Small delay to let the last ondataavailable fire
    setTimeout(() => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size === 0) {
        setError("No audio recorded. Please try again.");
        return;
      }
      submitAudio(blob);
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit audio to API ─────────────────────────────────────

  const submitAudio = useCallback(
    async (audioBlob: Blob) => {
      setFlowState("processing");
      setError(null);

      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        formData.append("companyId", selectedCompany.id);
        if (selectedPersonId) {
          formData.append("spokespersonId", selectedPersonId);
        }

        const res = await fetch("/api/create/voice-to-post", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || `Server error (${res.status})`);
        }

        const data = await res.json();
        setResult({
          postText: data.postText,
          transcription: data.transcription,
          postType: data.postType || "voice_note",
          imagePrompt: data.imagePrompt || null,
        });
        setEditedText(data.postText);
        setFlowState("result");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setError(msg);
        setFlowState("record");
      }
    },
    [selectedCompany.id, selectedPersonId]
  );

  // ── Regenerate with same transcription ──────────────────────

  const regenerate = useCallback(async () => {
    if (!result) return;
    setFlowState("processing");
    setError(null);

    try {
      const res = await fetch("/api/create/voice-to-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription: result.transcription,
          companyId: selectedCompany.id,
          spokespersonId: selectedPersonId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      setResult({
        postText: data.postText,
        transcription: data.transcription || result.transcription,
        postType: data.postType || "voice_note",
        imagePrompt: data.imagePrompt || null,
      });
      setEditedText(data.postText);
      setFlowState("result");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regeneration failed";
      setError(msg);
      setFlowState("result");
    }
  }, [result, selectedCompany.id, selectedPersonId]);

  // ── Reset to record ─────────────────────────────────────────

  const resetToRecord = useCallback(() => {
    setFlowState("record");
    setResult(null);
    setError(null);
    setElapsed(0);
    setEditing(false);
    setShowTranscript(false);
    setCopied(false);
  }, []);

  // ── Copy to clipboard ──────────────────────────────────────

  const handleCopy = useCallback(async () => {
    const text = editing ? editedText : result?.postText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [editing, editedText, result]);

  // ── Format timer ────────────────────────────────────────────

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Voice to Post</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record what happened today, what you are thinking, or what you noticed. We will turn it into a post.
        </p>
      </div>

      {/* Company / Spokesperson picker */}
      {(showCompanyPicker || companySpokespersons.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {showCompanyPicker && (
            <select
              value={selectedCompany.id}
              onChange={(e) => {
                const c = companies.find((co) => co.id === e.target.value);
                if (c) {
                  setSelectedCompany(c);
                  setSelectedPersonId(null);
                }
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {companySpokespersons.length > 0 && (
            <select
              value={selectedPersonId || ""}
              onChange={(e) => setSelectedPersonId(e.target.value || null)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">
                {selectedCompany.authorName} (default)
              </option>
              {companySpokespersons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isPrimary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── STATE 1: Record ─────────────────────────────────── */}
      {flowState === "record" && (
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white px-8 py-12 shadow-sm">
          {/* Record button */}
          <div className="relative">
            {/* Pulsing rings when recording */}
            {isRecording && (
              <>
                <div className="absolute inset-0 -m-4 rounded-full border-[3px] border-red-400 animate-ping opacity-20" />
                <div className="absolute inset-0 -m-2 rounded-full border-2 border-red-400 animate-pulse opacity-40" />
              </>
            )}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`
                relative z-10 flex items-center justify-center rounded-full
                transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2
                ${
                  isRecording
                    ? "h-24 w-24 bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600 focus:ring-red-300"
                    : "h-24 w-24 bg-violet-600 text-white shadow-lg shadow-violet-200 hover:bg-violet-700 focus:ring-violet-300"
                }
              `}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? (
                /* Stop icon */
                <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                /* Mic icon */
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Status text */}
          {isRecording ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <span className="text-lg font-semibold tabular-nums text-red-600">
                  {formatTime(elapsed)}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {elapsed < MAX_DURATION_SECONDS - 10
                  ? "Listening... tap the button when you are done."
                  : `${MAX_DURATION_SECONDS - elapsed}s remaining`}
              </p>
              {/* Progress bar for time limit */}
              <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-red-400 transition-all duration-500"
                  style={{ width: `${Math.min((elapsed / MAX_DURATION_SECONDS) * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-base text-gray-600">
                Tap to record.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Talk about what happened today, what you are thinking, or what you noticed.
              </p>
              <p className="mt-2 text-xs text-gray-300">
                Maximum 2 minutes
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── STATE 2: Processing ─────────────────────────────── */}
      {flowState === "processing" && (
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white px-8 py-16 shadow-sm">
          {/* Animated waveform bars */}
          <div className="flex items-end gap-1">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="w-2 rounded-full bg-violet-400"
                style={{
                  height: `${16 + Math.sin(i * 0.8) * 12}px`,
                  animation: `voiceWave 1.2s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
          <p className="text-base font-medium text-gray-700">
            Turning your voice into a post...
          </p>
          <p className="text-sm text-gray-500">
            Transcribing and writing. This takes a few seconds.
          </p>
          <style>{`
            @keyframes voiceWave {
              0% { height: 12px; opacity: 0.5; }
              100% { height: 32px; opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* ── STATE 3: Result ─────────────────────────────────── */}
      {flowState === "result" && result && (
        <div className="space-y-4">
          {/* LinkedIn Preview */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Preview
            </p>
            {editing ? (
              <div className="space-y-3">
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
                  >
                    Done editing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditedText(result.postText);
                      setEditing(false);
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Discard changes
                  </button>
                </div>
              </div>
            ) : (
              <LinkedInPreview
                authorName={authorName}
                authorTagline={authorTagline}
                authorAvatarUrl={authorAvatar}
                postText={editedText || result.postText}
                firstComment={null}
                brandColor={selectedCompany.brandColor}
              />
            )}
          </div>

          {/* Original transcription (collapsible) */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors rounded-xl"
            >
              <span>Original transcription</span>
              <svg
                className={`h-4 w-4 text-gray-500 transition-transform ${showTranscript ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTranscript && (
              <div className="border-t border-gray-100 px-4 py-3">
                <p className="text-sm leading-relaxed text-gray-600 italic">
                  {result.transcription}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? "Copied" : "Copy text"}
            </button>

            <button
              type="button"
              onClick={regenerate}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>

            <button
              type="button"
              onClick={resetToRecord}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
                />
              </svg>
              Record new
            </button>
          </div>

          {/* Post type badge */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Auto-detected type:</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-600 font-medium">
              {result.postType.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
