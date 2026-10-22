"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { audioExtension, RECORDING_MIME_TYPES } from "@/lib/providers/transcription/audio-format";

interface VoiceDictationProps {
  onTranscription: (text: string) => void;
  companyId?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  ariaLabel?: string;
}

type DictationState = "idle" | "starting" | "recording" | "transcribing" | "done";

const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 minutes

export default function VoiceDictation({
  onTranscription,
  companyId,
  className = "",
  placeholder = "Dictate your idea",
  disabled = false,
  onBusyChange,
  ariaLabel = "Click to dictate",
}: VoiceDictationProps) {
  const [state, setState] = useState<DictationState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const stateRef = useRef<DictationState>("idle");
  const operationRef = useRef(0);
  const callbacksRef = useRef({ onTranscription, onBusyChange });
  callbacksRef.current = { onTranscription, onBusyChange };

  const changeState = useCallback((next: DictationState) => {
    if (!mountedRef.current) return;
    const busy = (s: DictationState) => s === "starting" || s === "recording" || s === "transcribing";
    const wasBusy = busy(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (wasBusy !== busy(next)) callbacksRef.current.onBusyChange?.(busy(next));
  }, []);

  const releaseResources = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    timerRef.current = null;
    maxTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    changeState("idle");
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      releaseResources();
      requestRef.current?.abort();
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, [companyId, changeState, releaseResources]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      changeState("transcribing");
    }
    releaseResources();
  }, [changeState, releaseResources]);

  const startRecording = useCallback(async () => {
    setError(null);

    // Check for MediaRecorder support
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Your browser does not support audio recording. You can type instead.");
      return;
    }

    changeState("starting");
    const operation = ++operationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || operation !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      // Pick a supported MIME type
      const mimeType = typeof MediaRecorder.isTypeSupported === "function"
        ? RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
        : undefined;

      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        releaseResources();
        changeState("transcribing");

        const actualMimeType = recorder.mimeType || chunksRef.current[0]?.type || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMimeType });

        if (blob.size === 0) {
          setError("No audio recorded. Please try again.");
          changeState("idle");
          return;
        }

        const controller = new AbortController();
        requestRef.current = controller;
        const timeout = setTimeout(() => controller.abort(), 110_000);
        try {
          const formData = new FormData();
          formData.append("audio", blob, `recording.${audioExtension(actualMimeType)}`);

          const queryParams = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
          const res = await fetch(`/api/generate/transcribe/voice${queryParams}`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: "Transcription failed" }));
            throw new Error(errData.error || `Transcription failed (${res.status})`);
          }

          const data = await res.json();
          if (!mountedRef.current || operation !== operationRef.current) return;

          if (typeof data.text !== "string" || data.text.trim() === "") {
            setError("No speech detected. Please try again.");
            changeState("idle");
            return;
          }

          callbacksRef.current.onTranscription(data.text);
          changeState("done");

          // Return to idle after brief confirmation
          doneTimerRef.current = setTimeout(() => changeState("idle"), 1500);
        } catch (err) {
          if (!mountedRef.current || operation !== operationRef.current) return;
          setError(err instanceof Error && err.name === "AbortError"
            ? "Transcription took too long. Please try again or type instead."
            : err instanceof Error ? err.message : "Transcription failed. You can type instead.");
          changeState("idle");
        } finally {
          clearTimeout(timeout);
          if (operation === operationRef.current) requestRef.current = null;
        }
      };

      recorder.onerror = () => {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        releaseResources();
        setError("Recording error. Please try again or type instead.");
        changeState("idle");
      };

      // Start recording
      recorder.start(1000); // collect data every second
      startTimeRef.current = Date.now();
      setDuration(0);
      changeState("recording");

      // Duration timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
      }, 1000);

      // Auto-stop at max duration
      maxTimerRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch (err) {
      if (!mountedRef.current || operation !== operationRef.current) return;
      releaseResources();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone access in your browser settings.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start recording");
      }
      changeState("idle");
    }
  }, [companyId, changeState, releaseResources, stopRecording]);

  const handleClick = useCallback(() => {
    if (stateRef.current === "idle" && !disabled) {
      startRecording();
    } else if (stateRef.current === "recording") {
      stopRecording();
    } else if (stateRef.current === "starting") {
      operationRef.current += 1;
      changeState("idle");
    }
  }, [disabled, changeState, startRecording, stopRecording]);

  // Compact mode when placeholder is empty (inline icon in textarea)
  const isCompact = !placeholder;

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || state === "transcribing" || state === "done"}
          className={`
            inline-flex items-center gap-2 font-medium
            transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
            disabled:cursor-not-allowed disabled:opacity-60
            ${isCompact ? "rounded-lg p-2 text-xs" : "rounded-full px-4 py-2 text-sm"}
            ${
              state === "recording"
                ? "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400 animate-pulse"
                : state === "transcribing"
                ? "bg-gray-100 text-gray-500"
                : state === "done"
                ? "bg-green-50 text-green-700"
                : isCompact
                ? "text-gray-500 hover:text-violet-600 hover:bg-violet-50 focus:ring-violet-300"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300"
            }
          `}
          title={state === "idle" ? "Click to dictate" : undefined}
          aria-label={
            state === "recording"
              ? "Stop recording"
              : state === "starting"
              ? "Cancel microphone request"
              : state === "transcribing"
              ? "Transcribing audio"
              : state === "done"
              ? "Transcription complete"
              : ariaLabel
          }
        >
          {state === "idle" && (
            <>
              <svg className={isCompact ? "h-5 w-5" : "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
              </svg>
              {placeholder && <span>{placeholder}</span>}
            </>
          )}

          {state === "recording" && (
            <>
              <svg className={isCompact ? "h-5 w-5" : "h-4 w-4"} fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              <span>{isCompact ? formatTime(duration) : `Stop ${formatTime(duration)}`}</span>
            </>
          )}

          {(state === "starting" || state === "transcribing") && (
            <>
              <svg className={isCompact ? "h-5 w-5 animate-spin" : "h-4 w-4 animate-spin"} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {!isCompact && <span>{state === "starting" ? "Cancel microphone request" : "Transcribing..."}</span>}
            </>
          )}

          {state === "done" && (
            <>
              <svg className={isCompact ? "h-5 w-5" : "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {!isCompact && <span>Transcribed</span>}
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 max-w-xs">{error}</p>
      )}
    </div>
  );
}
