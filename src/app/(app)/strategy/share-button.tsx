"use client";

import { useState } from "react";

const BASE_URL = "https://agency-review-portal.vercel.app";

export function ShareStrategyButton({ shareToken }: { shareToken: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${BASE_URL}/strategy/${shareToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute left-0 top-full z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-gray-900">Share your strategy</h3>
            <p className="mt-1 text-xs text-gray-500">
              Anyone with this link can view your content strategy document.
            </p>

            {/* URL + Copy */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 font-mono focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  copied
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-violet-600 text-white hover:bg-violet-700"
                }`}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            {/* Mini preview */}
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 bg-gradient-to-b from-slate-50 to-white">
              <div className="border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-bold tracking-widest text-gray-300 uppercase">Content Strategy</p>
                  <p className="text-[10px] font-bold text-gray-700">Your Company</p>
                </div>
                <p className="text-[8px] text-gray-300">Powered by AGENCY</p>
              </div>
              <div className="px-3 py-3 space-y-2">
                {["01 Executive Summary", "02 Audience Profiles", "03 Positioning"].map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-800 text-[7px] font-bold text-white">
                      {s.slice(0, 2)}
                    </span>
                    <span className="text-[9px] font-semibold text-gray-500">{s.slice(3)}</span>
                  </div>
                ))}
                <p className="text-[8px] text-gray-300 pl-5">+ 5 more sections...</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
