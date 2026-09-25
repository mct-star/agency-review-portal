"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUDIENCE_PROBLEMS, BLOG_WORD_TARGETS, BRAND_PILLARS, CONTENT_PILLARS, audienceCodesOf,
} from "@/lib/content/blog-request";

/**
 * The Blog / Article form (25 Sept 2026). It asks for the three layers of
 * the content architecture and posts to /api/generate/blog, which writes
 * the article through the full method and saves it for review. Choosing a
 * topic from the bank fills the pillar and audience problem from it.
 */

export interface TopicOption { id: string; companyId: string; title: string; pillar: string | null; audienceTheme: string | null }

const field = "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";
const labelCls = "block text-sm font-medium text-gray-700";

export default function ArticleForm({ companies, topics, showCompanyPicker }: {
  companies: { id: string; name: string }[];
  topics: TopicOption[];
  showCompanyPicker: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [topicId, setTopicId] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [pillar, setPillar] = useState("");
  const [audienceTheme, setAudienceTheme] = useState("");
  const [brandPillar, setBrandPillar] = useState("");
  const [wordCountMax, setWordCountMax] = useState<number>(2200);
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyTopics = useMemo(
    () => topics.filter(t => t.companyId === companyId && (!pillar || t.pillar === pillar)),
    [topics, companyId, pillar],
  );

  function pickTopic(id: string) {
    setTopicId(id);
    const t = topics.find(x => x.id === id);
    if (!t) return;
    setTopicTitle(t.title);
    if (t.pillar && CONTENT_PILLARS.some(p => p.code === t.pillar)) setPillar(t.pillar);
    const [firstTheme] = audienceCodesOf(t.audienceTheme);
    if (firstTheme) setAudienceTheme(firstTheme);
  }

  const ready = !!companyId && topicTitle.trim().length >= 8 && !!pillar && !!audienceTheme && !!brandPillar;

  async function handleGenerate() {
    if (!ready || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, topicId: topicId || null, topicTitle, pillar, audienceTheme, brandPillar, wordCountMax, additionalContext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.pieceId) throw new Error(data.error || `Generation failed (${res.status})`);
      router.push(`/content/${data.pieceId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-5">
        {showCompanyPicker && (
          <div>
            <label htmlFor="article-company" className={labelCls}>Company</label>
            <select id="article-company" value={companyId} onChange={e => { setCompanyId(e.target.value); setTopicId(""); }} className={field}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="article-pillar" className={labelCls}>Content pillar (the subject)</label>
          <select id="article-pillar" value={pillar} onChange={e => { setPillar(e.target.value); setTopicId(""); }} className={field}>
            <option value="">Choose a pillar</option>
            {CONTENT_PILLARS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}
          </select>
        </div>

        {companyTopics.length > 0 && (
          <div>
            <label htmlFor="article-bank" className={labelCls}>From the topic bank (optional)</label>
            <select id="article-bank" value={topicId} onChange={e => pickTopic(e.target.value)} className={field}>
              <option value="">Write my own topic</option>
              {companyTopics.map(t => <option key={t.id} value={t.id}>{t.pillar ? `${t.pillar} · ` : ""}{t.title}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="article-topic" className={labelCls}>Topic or working title</label>
          <input
            id="article-topic"
            type="text"
            value={topicTitle}
            onChange={e => { setTopicTitle(e.target.value); setTopicId(""); }}
            placeholder="e.g. Why hospital procurement teams need a demand generation strategy"
            className={`${field} placeholder:text-gray-500`}
          />
        </div>

        <div>
          <label htmlFor="article-audience" className={labelCls}>Audience problem (the relevance)</label>
          <select id="article-audience" value={audienceTheme} onChange={e => setAudienceTheme(e.target.value)} className={field}>
            <option value="">Choose the problem it speaks to</option>
            {AUDIENCE_PROBLEMS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="article-brand" className={labelCls}>Brand pillar (the credibility, never named)</label>
          <select id="article-brand" value={brandPillar} onChange={e => setBrandPillar(e.target.value)} className={field}>
            <option value="">Choose the brand pillar</option>
            {BRAND_PILLARS.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="article-wordcount" className={labelCls}>Length</label>
          <select id="article-wordcount" value={wordCountMax} onChange={e => setWordCountMax(Number(e.target.value))} className={field}>
            {BLOG_WORD_TARGETS.map(w => <option key={w} value={w}>1,800 to {w.toLocaleString("en-GB")} words</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="article-context" className={labelCls}>Anything the writer should know (optional)</label>
          <textarea
            id="article-context"
            rows={3}
            value={additionalContext}
            onChange={e => setAdditionalContext(e.target.value)}
            placeholder="A story to use, a client situation, a point to land"
            className={`${field} placeholder:text-gray-500`}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={!ready || generating}
          className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "Writing and checking, about 2 to 4 minutes" : "Write the article"}
        </button>
        <p className="text-xs text-gray-500">
          Written in the company voice against the blog template, checked and corrected up to three times, then saved for review.
        </p>
      </div>
    </div>
  );
}
