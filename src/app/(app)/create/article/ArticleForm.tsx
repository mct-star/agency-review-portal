"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ArticleFormProps {
  companies: { id: string; name: string }[];
  showCompanyPicker: boolean;
}

const WORD_COUNTS = [
  { value: "800", label: "800 words" },
  { value: "1200", label: "1,200 words" },
  { value: "1800", label: "1,800 words" },
];

export default function ArticleForm({ companies, showCompanyPicker }: ArticleFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [wordCount, setWordCount] = useState("1200");
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    // Route to quick generate with blog_article content type
    const params = new URLSearchParams({
      topic: topic.trim(),
      postType: "blog_article",
    });
    router.push(`/generate/quick?${params.toString()}`);
  }

  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-5">
        {/* Topic */}
        <div>
          <label htmlFor="article-topic" className="block text-sm font-medium text-gray-700">
            Topic or title
          </label>
          <input
            id="article-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Why hospital procurement teams need a demand generation strategy"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Company selector (admin only) */}
        {showCompanyPicker && (
          <div>
            <label htmlFor="article-company" className="block text-sm font-medium text-gray-700">
              Company
            </label>
            <select
              id="article-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Word count */}
        <div>
          <label htmlFor="article-wordcount" className="block text-sm font-medium text-gray-700">
            Word count target
          </label>
          <select
            id="article-wordcount"
            value={wordCount}
            onChange={(e) => setWordCount(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {WORD_COUNTS.map((wc) => (
              <option key={wc.value} value={wc.value}>
                {wc.label}
              </option>
            ))}
          </select>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!topic.trim() || generating}
          className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "Redirecting..." : "Generate Article"}
        </button>
      </div>
    </div>
  );
}
