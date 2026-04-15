"use client";

import { useState } from "react";

interface RepurposeFormProps {
  companies: { id: string; name: string }[];
  showCompanyPicker: boolean;
  existingArticles: { id: string; title: string; markdown_body: string }[];
}

interface RepurposedPiece {
  type: string;
  title: string;
  body: string;
  firstComment: string | null;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  problem_diagnosis: { label: "Problem Diagnosis", color: "bg-red-100 text-red-700" },
  contrarian_take: { label: "Contrarian Take", color: "bg-purple-100 text-purple-700" },
  expert_perspective: { label: "Expert Perspective", color: "bg-blue-100 text-blue-700" },
  how_to: { label: "How-To", color: "bg-green-100 text-green-700" },
  personal_reflection: { label: "Personal Reflection", color: "bg-amber-100 text-amber-700" },
  carousel: { label: "Carousel", color: "bg-pink-100 text-pink-700" },
  newsletter_intro: { label: "Newsletter Intro", color: "bg-indigo-100 text-indigo-700" },
};

export default function RepurposeForm({ companies, showCompanyPicker, existingArticles }: RepurposeFormProps) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [sourceText, setSourceText] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [pieces, setPieces] = useState<RepurposedPiece[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // When an existing article is selected, populate the textarea
  function handleArticleSelect(articleId: string) {
    setSelectedArticleId(articleId);
    if (articleId) {
      const article = existingArticles.find((a) => a.id === articleId);
      if (article) {
        setSourceText(article.markdown_body);
      }
    }
  }

  async function handleRepurpose() {
    if (!sourceText.trim() || sourceText.trim().length < 100) {
      setError("Please provide at least 100 characters of source content.");
      return;
    }

    setLoading(true);
    setError(null);
    setPieces([]);
    setSelected(new Set());
    setSaved(false);

    try {
      const res = await fetch("/api/generate/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, sourceText }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate repurposed content");
        return;
      }

      setPieces(data.pieces || []);
      // Select all by default
      setSelected(new Set((data.pieces || []).map((_: unknown, i: number) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(index: number) {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === pieces.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pieces.map((_, i) => i)));
    }
  }

  async function handleSave() {
    if (selected.size === 0) return;

    setSaving(true);
    setError(null);

    try {
      // Calculate current week number
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      const daysSinceJan1 = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);

      // Save each selected piece
      const selectedPieces = pieces.filter((_, i) => selected.has(i));
      const promises = selectedPieces.map((piece) =>
        fetch("/api/content/pieces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            weekNumber,
            postType: piece.type,
            platform: "linkedin",
            title: piece.title,
            markdownBody: piece.body,
            firstComment: piece.firstComment,
          }),
        })
      );

      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.ok);

      if (failed.length > 0) {
        setError(`Saved ${results.length - failed.length} of ${results.length} pieces. ${failed.length} failed.`);
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Input form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        {showCompanyPicker && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full max-w-xs"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {existingArticles.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Select an existing article (optional)
            </label>
            <select
              value={selectedArticleId}
              onChange={(e) => handleArticleSelect(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full"
            >
              <option value="">Paste custom content below instead...</option>
              {existingArticles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Paste your blog post, article, or long-form content
          </label>
          <textarea
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
              setSelectedArticleId("");
            }}
            rows={10}
            placeholder="Paste your long-form content here (minimum 100 characters)..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            {sourceText.length} characters
          </p>
        </div>

        <button
          onClick={handleRepurpose}
          disabled={loading || sourceText.trim().length < 100}
          className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating 7 pieces from your content...
            </span>
          ) : (
            "Repurpose"
          )}
        </button>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {pieces.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {pieces.length} derivative pieces generated
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="text-sm text-violet-600 hover:text-violet-700 font-medium"
              >
                {selected.size === pieces.length ? "Deselect all" : "Select all"}
              </button>
              {!saved ? (
                <button
                  onClick={handleSave}
                  disabled={saving || selected.size === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : `Save ${selected.size} selected posts`}
                </button>
              ) : (
                <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Saved to current week
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            {pieces.map((piece, i) => {
              const typeInfo = TYPE_LABELS[piece.type] || { label: piece.type, color: "bg-gray-100 text-gray-700" };
              const isExpanded = expandedIndex === i;
              const isSelected = selected.has(i);

              return (
                <div
                  key={i}
                  className={`rounded-xl border bg-white transition-colors ${
                    isSelected ? "border-violet-300 ring-1 ring-violet-100" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-3 p-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(i)}
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-gray-300 bg-white hover:border-gray-400"
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">{piece.title}</h3>

                      {/* Preview / expanded body */}
                      <div className={`mt-2 text-sm text-gray-600 whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-3"}`}>
                        {piece.body}
                      </div>

                      <button
                        onClick={() => setExpandedIndex(isExpanded ? null : i)}
                        className="mt-1 text-xs font-medium text-violet-600 hover:text-violet-700"
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>

                      {piece.firstComment && isExpanded && (
                        <div className="mt-3 rounded-lg bg-gray-50 p-3">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">First Comment</p>
                          <p className="text-sm text-gray-600">{piece.firstComment}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
