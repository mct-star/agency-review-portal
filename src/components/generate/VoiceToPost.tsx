"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Web Speech API type declarations.
 * These are not included in the default TypeScript lib,
 * so we declare them here for type safety.
 */
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface VoiceToPostProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type RecordingState = "idle" | "recording" | "unsupported";

/**
 * VoiceToPost - large microphone button with real-time browser transcription.
 *
 * Uses the Web Speech API (SpeechRecognition) for zero-cost, real-time
 * speech-to-text. No server round-trip, no API key required.
 *
 * Shows a large violet mic button as the visual centrepiece.
 * Transcript appears in real time as the user speaks.
 */
export default function VoiceToPost({ onTranscript, disabled = false }: VoiceToPostProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const finalTranscriptRef = useRef("");

  // Check browser support on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      setState("unsupported");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      setState("unsupported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";

    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimText("");
    setElapsed(0);

    recognition.onstart = () => {
      setState("recording");
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      finalTranscriptRef.current = final;
      setTranscript(final);
      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are not real errors, just user pauses
      if (event.error === "no-speech" || event.error === "aborted") return;

      if (event.error === "not-allowed") {
        setState("idle");
      }
    };

    recognition.onend = () => {
      // Speech recognition can end on its own (silence timeout, etc.)
      // If we still have state=recording, the user did not click stop,
      // so restart automatically to keep continuous recording going.
      if (timerRef.current) {
        // Still meant to be recording -- restart
        try {
          recognition.start();
        } catch {
          // If restart fails, stop gracefully
          stopTimer();
          setState("idle");
        }
        return;
      }
      setState("idle");
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setState("idle");
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setState("idle");

    // Deliver the final transcript
    const fullText = (finalTranscriptRef.current + " " + interimText).trim();
    if (fullText) {
      onTranscript(fullText);
    }
  }, [interimText, onTranscript, stopTimer]);

  const handleMicClick = useCallback(() => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      startRecording();
    }
  }, [state, startRecording, stopRecording]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const displayText = transcript + (interimText ? " " + interimText : "");

  // Unsupported browser
  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
        <svg className="mx-auto mb-2 h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-sm font-medium text-amber-800">Voice recording not supported in this browser</p>
        <p className="mt-1 text-xs text-amber-600">Try Chrome or Edge for voice-to-post.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mic button */}
      <div className="relative">
        {/* Pulsing ring when recording */}
        {state === "recording" && (
          <>
            <div className="absolute inset-0 -m-2 rounded-full border-[3px] border-red-400 animate-ping opacity-30" />
            <div className="absolute inset-0 -m-1 rounded-full border-2 border-red-400 animate-pulse" />
          </>
        )}
        <button
          type="button"
          onClick={handleMicClick}
          disabled={disabled}
          className={`
            relative z-10 flex h-20 w-20 items-center justify-center rounded-full
            transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2
            disabled:cursor-not-allowed disabled:opacity-50
            ${
              state === "recording"
                ? "bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600 focus:ring-red-300"
                : "bg-violet-600 text-white shadow-lg shadow-violet-200 hover:bg-violet-700 focus:ring-violet-300"
            }
          `}
          aria-label={state === "recording" ? "Stop recording" : "Start recording"}
        >
          {state === "recording" ? (
            /* Stop icon */
            <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            /* Mic icon */
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
      {state === "idle" && !displayText && (
        <p className="text-sm text-gray-500">
          Tap to record. Tell us what&apos;s on your mind.
        </p>
      )}

      {state === "recording" && (
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-medium text-red-600">
            Recording {formatTime(elapsed)}
          </span>
        </div>
      )}

      {/* Real-time transcript */}
      {displayText && (
        <div className="w-full rounded-lg border border-violet-200 bg-violet-50/50 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">
            Transcript
          </p>
          <p className="text-sm text-gray-800 leading-relaxed">
            {transcript}
            {interimText && (
              <span className="text-gray-400 italic">{" "}{interimText}</span>
            )}
          </p>
        </div>
      )}

      {/* Use / Re-record buttons after stopping with text */}
      {state === "idle" && displayText && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onTranscript(displayText.trim());
              setTranscript("");
              setInterimText("");
              finalTranscriptRef.current = "";
            }}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 transition-colors"
          >
            Use this transcript
          </button>
          <button
            type="button"
            onClick={() => {
              setTranscript("");
              setInterimText("");
              finalTranscriptRef.current = "";
              startRecording();
            }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Re-record
          </button>
        </div>
      )}
    </div>
  );
}
