"use client";

import { useState, useEffect, useCallback } from "react";

interface Quote {
  text: string;
  gradient: string; // Tailwind gradient classes for the text
  accentBg: string; // Subtle background glow
  barColor: string; // Decorative accent bar
}

const QUOTES: Quote[] = [
  {
    text: "The consultancies that show up consistently win. The ones that don\u2019t, get forgotten.",
    gradient: "from-violet-600 via-purple-600 to-indigo-600",
    accentBg: "bg-violet-100/60",
    barColor: "bg-violet-500",
  },
  {
    text: "Your prospects are making buying decisions right now. Are you in the conversation?",
    gradient: "from-sky-600 via-cyan-600 to-teal-600",
    accentBg: "bg-sky-100/60",
    barColor: "bg-sky-500",
  },
  {
    text: "It\u2019s not a sales problem. It\u2019s a visibility problem.",
    gradient: "from-amber-600 via-orange-600 to-red-500",
    accentBg: "bg-amber-100/60",
    barColor: "bg-amber-500",
  },
  {
    text: "12 minutes. That\u2019s all the time a supplier gets in front of a buyer. Make sure they already know your name.",
    gradient: "from-emerald-600 via-green-600 to-teal-600",
    accentBg: "bg-emerald-100/60",
    barColor: "bg-emerald-500",
  },
  {
    text: "Your best salespeople don\u2019t work for you. Your content does.",
    gradient: "from-rose-600 via-pink-600 to-fuchsia-600",
    accentBg: "bg-rose-100/60",
    barColor: "bg-rose-500",
  },
  {
    text: "Nobody ever got fired for being the company that showed up every week with something useful to say.",
    gradient: "from-indigo-600 via-blue-600 to-violet-600",
    accentBg: "bg-indigo-100/60",
    barColor: "bg-indigo-500",
  },
  {
    text: "The best time to start was six months ago. The second best time is this week.",
    gradient: "from-teal-600 via-emerald-500 to-cyan-600",
    accentBg: "bg-teal-100/60",
    barColor: "bg-teal-500",
  },
];

// Pick a deterministic-but-daily-changing quote based on the date
function getTodayIndex(): number {
  const now = new Date();
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  return daysSinceEpoch % QUOTES.length;
}

export default function RotatingQuote() {
  const [index, setIndex] = useState(getTodayIndex);
  const [fade, setFade] = useState(true);

  const quote = QUOTES[index];

  const goTo = useCallback(
    (next: number) => {
      setFade(false);
      setTimeout(() => {
        setIndex(next);
        setFade(true);
      }, 300);
    },
    []
  );

  // Auto-rotate every 12 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      goTo((index + 1) % QUOTES.length);
    }, 12000);
    return () => clearInterval(timer);
  }, [index, goTo]);

  return (
    <div className="relative mx-auto mt-8 max-w-3xl">
      {/* Subtle background glow */}
      <div
        className={`absolute inset-0 -z-10 rounded-3xl blur-3xl transition-colors duration-700 ${quote.accentBg}`}
        style={{ transform: "scale(1.1)" }}
      />

      {/* Quote card */}
      <div className="relative rounded-2xl border border-gray-100 bg-white/80 backdrop-blur-sm px-8 py-10 shadow-sm sm:px-12 sm:py-12">
        {/* Accent bar */}
        <div
          className={`absolute left-0 top-6 bottom-6 w-1 rounded-full transition-colors duration-700 ${quote.barColor}`}
        />

        {/* Large open-quote mark */}
        <div className={`mb-4 text-5xl font-serif leading-none bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent select-none`}>
          &ldquo;
        </div>

        {/* Quote text — large typographic treatment with gradient */}
        <p
          className={`text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl lg:text-[1.7rem] bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent transition-opacity duration-300 ${
            fade ? "opacity-100" : "opacity-0"
          }`}
        >
          {quote.text}
        </p>

        {/* Dot navigation */}
        <div className="mt-8 flex items-center justify-center gap-2">
          {QUOTES.map((q, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Quote ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index
                  ? `w-6 ${q.barColor}`
                  : "w-2 bg-gray-200 hover:bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
