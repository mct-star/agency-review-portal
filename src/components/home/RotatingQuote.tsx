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

// Quotes drawn from "It's Not a Sales Problem" by Michael Colling-Tuck.
// Rotating daily. Each line is either a direct quote or a compressed
// expression of a book idea, all attributed to the source.
const QUOTES: Quote[] = [
  {
    text: "Most healthcare companies think they have a sales problem. They have a demand problem.",
    author: "Michael Colling-Tuck",
    role: "It's Not a Sales Problem",
    gradient: "from-violet-600 via-purple-600 to-indigo-600",
    accentBg: "bg-violet-100/60",
    barColor: "bg-violet-500",
  },
  {
    text: "Only 24% of HCPs are accessible to suppliers. What are you doing about the other 76%?",
    author: "Michael Colling-Tuck",
    role: "It's Not a Sales Problem",
    gradient: "from-sky-600 via-cyan-600 to-teal-600",
    accentBg: "bg-sky-100/60",
    barColor: "bg-sky-500",
  },
  {
    text: "Campaigns end. Systems compound.",
    author: "Michael Colling-Tuck",
    role: "It's Not a Sales Problem",
    gradient: "from-amber-600 via-orange-600 to-red-500",
    accentBg: "bg-amber-100/60",
    barColor: "bg-amber-500",
  },
  {
    text: "One told her about a company. The other told her about her hospital. Guess who won.",
    author: "Michael Colling-Tuck",
    role: "It's Not a Sales Problem",
    gradient: "from-emerald-600 via-green-600 to-teal-600",
    accentBg: "bg-emerald-100/60",
    barColor: "bg-emerald-500",
  },
  {
    text: "Stretch too far and you lose credibility. Stay too close and you say nothing.",
    author: "Michael Colling-Tuck",
    role: "The Elastic Band, Ch 7",
    gradient: "from-rose-600 via-pink-600 to-fuchsia-600",
    accentBg: "bg-rose-100/60",
    barColor: "bg-rose-500",
  },
  {
    text: "Activity goes up. Results don't. That's not a sales problem.",
    author: "Michael Colling-Tuck",
    role: "It's Not a Sales Problem",
    gradient: "from-violet-700 via-indigo-600 to-sky-600",
    accentBg: "bg-indigo-100/60",
    barColor: "bg-indigo-500",
  },
  {
    text: "Your best salespeople don't work for you. Your advocates do.",
    author: "Michael Colling-Tuck",
    role: "Equip Your Advocates, Ch 11",
    gradient: "from-indigo-600 via-blue-600 to-violet-600",
    accentBg: "bg-indigo-100/60",
    barColor: "bg-indigo-500",
  },
  {
    text: "The playbook changed. Nobody sent a memo. This is the memo.",
    author: "Michael Colling-Tuck",
    role: "It's Not a Sales Problem",
    gradient: "from-teal-600 via-emerald-500 to-cyan-600",
    accentBg: "bg-teal-100/60",
    barColor: "bg-teal-500",
  },
  {
    text: "Fishing in an empty pond and blaming the rod.",
    author: "Michael Colling-Tuck",
    role: "The Diagnosis, Ch 5",
    gradient: "from-amber-600 via-yellow-600 to-orange-500",
    accentBg: "bg-amber-100/60",
    barColor: "bg-amber-500",
  },
  {
    text: "Three weeks getting a LinkedIn post through legal review. Meanwhile, your competitor published nine.",
    author: "Michael Colling-Tuck",
    role: "Building Capability, Ch 13",
    gradient: "from-fuchsia-600 via-purple-600 to-violet-600",
    accentBg: "bg-fuchsia-100/60",
    barColor: "bg-fuchsia-500",
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
    <div className="relative mx-auto max-w-3xl">
      {/* Soft background glow */}
      <div
        className={`absolute inset-0 -z-10 rounded-3xl blur-3xl transition-all duration-1000 ${quote.accentBg}`}
        style={{ transform: "scale(1.15)" }}
      />

      {/* Quote card */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white/80 backdrop-blur-sm shadow-sm">
        {/* Top gradient accent */}
        <div className={`h-1 bg-gradient-to-r ${quote.gradient} transition-all duration-700`} />

        <div className="px-10 py-10 sm:px-14 sm:py-12">
          <div
            className={`transition-all duration-350 ${
              fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            {/* Quote text with inline opening and closing marks — proper pull-quote style */}
            <blockquote
              className={`text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl lg:text-[1.7rem] bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent`}
            >
              <span
                aria-hidden="true"
                className="font-serif text-5xl leading-none sm:text-6xl"
                style={{ verticalAlign: "-0.25em", marginRight: "0.08em" }}
              >
                &ldquo;
              </span>
              {quote.text}
              <span
                aria-hidden="true"
                className="font-serif text-5xl leading-none sm:text-6xl"
                style={{ verticalAlign: "-0.35em", marginLeft: "0.05em" }}
              >
                &rdquo;
              </span>
            </blockquote>

            {/* Author attribution */}
            <div className="mt-6 flex items-center justify-end gap-2">
              <div className={`h-px w-10 bg-gradient-to-r ${quote.gradient} opacity-40`} />
              <div className="text-right">
                <p className={`text-sm font-semibold bg-gradient-to-r ${quote.gradient} bg-clip-text text-transparent`}>
                  {quote.author}
                </p>
                {quote.role && (
                  <p className="text-xs italic text-gray-400">{quote.role}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dot navigation */}
        <div className="flex items-center justify-center gap-1.5 pb-5">
          {QUOTES.map((q, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Quote ${i + 1} of ${QUOTES.length}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index
                  ? `w-6 ${q.barColor}`
                  : "w-1.5 bg-gray-200 hover:bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
