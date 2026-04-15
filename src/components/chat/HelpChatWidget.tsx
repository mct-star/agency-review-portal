"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReportIssueForm from "./ReportIssueForm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi! I'm Scout. I can help you find your way around the platform. What would you like to know?",
};

function ScoutAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className || "h-8 w-8"}>
      <circle cx="20" cy="20" r="20" fill="#7C3AED" />
      <circle cx="14" cy="16" r="2.5" fill="white" />
      <circle cx="26" cy="16" r="2.5" fill="white" />
      <path
        d="M13 25 Q20 31 27 25"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HelpChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hydration-safe mount + restore localStorage preference
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("help-chat-open");
    if (stored === "true") {
      setIsOpen(true);
    }
    // Show "Need help?" badge on first visit
    const visited = localStorage.getItem("help-chat-visited");
    if (!visited) {
      setShowBadge(true);
      localStorage.setItem("help-chat-visited", "true");
      const timer = setTimeout(() => setShowBadge(false), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Persist open state
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("help-chat-open", String(isOpen));
    }
  }, [isOpen, mounted]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I had trouble responding. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Chat panel */}
      <div
        className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-200 ease-out ${
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        } bottom-24 right-6 h-[500px] w-[380px] max-sm:bottom-0 max-sm:right-0 max-sm:h-[70vh] max-sm:w-full max-sm:rounded-b-none`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-3">
          <ScoutAvatar className="h-7 w-7" />
          <span className="flex-1 text-sm font-semibold text-white">Scout</span>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Close help chat"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages or Report Form */}
        {showReportForm ? (
          <ReportIssueForm
            onClose={() => setShowReportForm(false)}
            onSubmitted={() => {
              setShowReportForm(false);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Ticket created! We'll investigate and get back to you." },
              ]);
            }}
          />
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white"
                        : "bg-gray-50 text-gray-900"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-1 rounded-2xl bg-gray-50 px-4 py-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Scout anything..."
                  disabled={loading}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-violet-400 focus:bg-white disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Report issue link */}
            <button
              onClick={() => setShowReportForm(true)}
              className="w-full text-center py-2 text-xs text-gray-500 hover:text-violet-600 transition-colors border-t border-gray-100"
            >
              Having a problem? Report an issue
            </button>
          </>
        )}
      </div>

      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-violet-500 shadow-lg transition-all hover:scale-105 hover:shadow-xl ${
          !isOpen && mounted ? "animate-bounce-once" : ""
        }`}
        aria-label="Open help chat"
      >
        {isOpen ? (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <ScoutAvatar className="h-8 w-8" />
        )}
      </button>

      {/* "Need help?" badge */}
      {showBadge && !isOpen && (
        <div className="fixed bottom-[5.5rem] right-6 z-50 animate-fade-in rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-violet-700 shadow-md">
          Need help?
        </div>
      )}

      {/* Keyframe animations */}
      <style jsx>{`
        @keyframes bounce-once {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-8px); }
          50% { transform: translateY(0); }
          75% { transform: translateY(-4px); }
        }
        .animate-bounce-once {
          animation: bounce-once 0.6s ease-out 1s 1;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
}
