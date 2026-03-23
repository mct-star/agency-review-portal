"use client";

import { useState, useEffect, useCallback } from "react";

interface Quote {
  text: string;
  author: string;
  role?: string;
  gradient: string;
  accentBg: string;
  barColor: string;
}

const QUOTES: Quote[] = [
  {
    text: "The consultancies that show up consistently win. The ones that don\u2019t, get forgotten.",
    author: "AGENCY Bristol",
    gradient: "from-violet-600 via-purple-600 to-indigo-600",
    accentBg: "bg-violet-100/60",
    barColor: "bg-violet-500",
  },
  {
    text: "Your prospects are making buying decisions right now. Are you in the conversation?",
    author: "AGENCY Bristol",
    gradient: "from-sky-600 via-cyan-600 to-teal-600",
    accentBg: "bg-sky-100/60",
    barColor: "bg-sky-500",
  },
  {
    text: "It\u2019s not a sales problem. It\u2019s a visibility problem.",
    author: "AGENCY Bristol",
    gradient: "from-amber-600 via-orange-600 to-red-500",
    accentBg: "bg-amber-100/60",
    barColor: "bg-amber-500",
  },
  {
    text: "12 minutes. That\u2019s all the time a supplier gets in front of a buyer. Make sure they already know your name.",
    author: "AGENCY Bristol",
    gradient: "from-emerald-600 via-green-600 to-teal-600",
    accentBg: "bg-emerald-100/60",
    barColor: "bg-emerald-500",
  },
  {
    text: "Your best salespeople don\u2019t work for you. Your content does.",
    author: "AGENCY Bristol",
    gradient: "from-rose-600 via-pink-600 to-fuchsia-600",
    accentBg: "bg-rose-100/60",
    barColor: "bg-rose-500",
  },
  {
    text: "The science is in the planning. The art is in the execution.",
    author: "Michael Colling-Tuck",
    role: "Founder, AGENCY Bristol",
    gradient: "from-violet-700 via-indigo-600 to-sky-600",
    accentBg: "bg-indigo-100/60",
    barColor: "bg-indigo-500",
  },
  {
    text: "Nobody ever got fired for being the company that showed up every week with something useful to say.",
    author: "AGENCY Bristol",
    gradient: "from-indigo-600 via-blue-600 to-violet-600",
    accentBg: "bg-indigo-100/60",
    barColor: "bg-indigo-500",
  },
  {
    text: "The best time to start was six months ago. The second best time is this week.",
    author: "AGENCY Bristol",
    gradient: "from-teal-600 via-emerald-500 to-cyan-600",
    accentBg: "bg-teal-100/60",
    barColor: "bg-teal-500",
  },
];

function getTodayIndex(): number {
  const now = new Date();
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  return daysSinceEpoch % QUOTES.length;
}

export default function RotatingQuote() {
  const [index, setIndex] = useState(getTodayIndex);
  const [fade, setFade] = useState(true);

  const quote = QUOTES[index];

  const goTo = useCallback((next: number) => {
    if (next === index) return;
    setFade(false);
    setTimeout(() => {
      setIndex(next);
      setFade(true);
    }, 350);
  }, [index]);

  useEffect(() => {
    const timer = setInterval(() => {
      goTo((index + 1) % QUOTES.length);
    }, 12000);
    return () => clearInterval(timer);
  }, [index, goTo]);

  return (
    <div className="relative mx-auto mt-8 max-w-3xl">
      {/* Background glow */}
      <div
        className={`absolute inset-0 -z-10 rounded-3xl blur-3xl transition-all duration-1000 ${quote.accentBg}`}
        style={{ transform: "scale(1.15)" }}
      />

      {/* Quote card */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white/80 backdrop-blur-sm shadow-sm">
        {/* Top gradient accent line */}
        <div className={`h-1 bg-gradient-to-r ${quote.gradient} transition-all duration-700`} />

        {/* Left accent bar */}
        <div
          className={`absolute left-0 top-8 bottom-8 w-1 rounded-full transition-colors duration-700 ${quote.barColor}`}
        />

        <div className="px-10 py-10 sm:px-14 sm:py-12">
          {/* Quote text with opening and closing marks */}
          <div
            className={`transition-all duration-350 ${
              fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            {/* Opening quote mark */}
            <span
              className={`block text-6xl font-serif leading-none bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent select-none sm:text-7xl`}
              style={{ marginBottom: "-0.15em" }}
            >
              &ldquo;
            </span>

            {/* Quote body */}
            <p
              className={`text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl lg:text-[1.75rem] bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent`}
            >
              {quote.text}
            </p>

            {/* Closing quote mark */}
            <span
              className={`block text-right text-6xl font-serif leading-none bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent select-none sm:text-7xl`}
              style={{ marginTop: "-0.35em" }}
            >
              &rdquo;
            </span>

            {/* Author attribution */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <div className={`h-px w-8 bg-gradient-to-r ${quote.gradient} opacity-40`} />
              <div className="text-right">
                <p className={`text-sm font-semibold bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent`}>
                  {quote.author}
                </p>
                {quote.role && (
                  <p className="text-xs text-gray-400">{quote.role}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom nav area */}
        <div className="flex items-center justify-center gap-2 pb-6">
          {QUOTES.map((q, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Quote ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index
                  ? `w-7 ${q.barColor}`
                  : "w-2 bg-gray-200 hover:bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
