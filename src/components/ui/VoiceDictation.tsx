"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceDictationProps {
  onTranscription: (text: string) => void;
  companyId?: string;
  className?: string;
  placeholder?: string;
}

type DictationState = "idle" | "recording" | "transcribing" | "done";

const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 minutes

export default function VoiceDictation({
  onTranscription,
  companyId,
  className = "",
  placeholder = "Dictate your idea",
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    // Check for MediaRecorder support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Your browser does not support audio recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setState("transcribing");

        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (blob.size === 0) {
          setError("No audio recorded. Please try again.");
          setState("idle");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");

          const queryParams = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
          const res = await fetch(`/api/generate/transcribe/voice${queryParams}`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: "Transcription failed" }));
            throw new Error(errData.error || `Transcription failed (${res.status})`);
          }

          const data = await res.json();

          if (!data.text || data.text.trim() === "") {
            setError("No speech detected. Please try again.");
            setState("idle");
            return;
          }

          onTranscription(data.text);
          setState("done");

          // Return to idle after brief confirmation
          setTimeout(() => setState("idle"), 1500);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
          setState("idle");
        }
      };

      recorder.onerror = () => {
        setError("Recording error. Please try again.");
        setState("idle");
        stopRecording();
      };

      // Start recording
      recorder.start(1000); // collect data every second
      startTimeRef.current = Date.now();
      setDuration(0);
      setState("recording");

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
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone access in your browser settings.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start recording");
      }
      setState("idle");
    }
  }, [companyId, onTranscription, stopRecording]);

  const handleClick = useCallback(() => {
    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  }, [state, startRecording, stopRecording]);

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <div className="inline-flex items-center gap-2">
        {/* Main mic / stop button */}
        <button
          type="button"
          onClick={handleClick}
          disabled={state === "transcribing" || state === "done"}
          className={`
            inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium
            transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
            disabled:cursor-not-allowed disabled:opacity-60
            ${
              state === "recording"
                ? "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400 animate-pulse"
                : state === "transcribing"
                ? "bg-gray-100 text-gray-500"
                : state === "done"
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300"
            }
          `}
          aria-label={
            state === "recording"
              ? "Stop recording"
              : state === "transcribing"
              ? "Transcribing audio"
              : state === "done"
              ? "Transcription complete"
              : "Start voice recording"
          }
        >
          {state === "idle" && (
            <>
              {/* Mic icon */}
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
              <span>{placeholder}</span>
            </>
          )}

          {state === "recording" && (
            <>
              {/* Stop icon */}
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              <span>Stop {formatTime(duration)}</span>
            </>
          )}

          {state === "transcribing" && (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Transcribing...</span>
            </>
          )}

          {state === "done" && (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Transcribed</span>
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-600 max-w-xs">{error}</p>
      )}
    </div>
  );
}
