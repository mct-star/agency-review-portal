"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { parseReviewDocument, type ParsedWeek, type ParsedPiece } from "@/lib/parsers/review-document-parser";
import type { Company } from "@/types/database";
import Badge from "@/components/ui/Badge";

const contentTypeLabels: Record<string, string> = {
  social_post: "Social Post",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
};

export default function UploadPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [parsed, setParsed] = useState<ParsedWeek | null>(null);
  const [weekNumber, setWeekNumber] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const router = useRouter();

  useEffect(() => {
    async function loadCompanies() {
      const supabase = createClient();
      const { data } = await supabase
        .from("companies")
        .select("*")
        .order("name");
      if (data) setCompanies(data);
    }
    loadCompanies();
  }, []);

  function handleParse() {
    if (!markdown.trim()) return;

    const result = parseReviewDocument(markdown);
    setParsed(result);

    if (result.week_number) setWeekNumber(String(result.week_number));
    if (result.title) setTitle(result.title);
    // Date parsing from the review doc header is approximate — user can adjust
    if (result.date_start) setDateStart(result.date_start);
    if (result.date_end) setDateEnd(result.date_end);

    setStep(2);
  }

  async function handleSave(publish: boolean) {
    if (!selectedCompanyId || !weekNumber || !dateStart || !dateEnd || !parsed) return;

    setSaving(true);
    const supabase = createClient();

    // Create week
    const { data: week, error: weekError } = await supabase
      .from("weeks")
      .insert({
        company_id: selectedCompanyId,
        week_number: parseInt(weekNumber, 10),
        year: new Date(dateStart).getFullYear() || 2026,
        date_start: dateStart,
        date_end: dateEnd,
        title: title || null,
        pillar: parsed.pillar,
        theme: parsed.theme,
        status: publish ? "ready_for_review" : "draft",
      })
      .select()
      .single();

    if (weekError || !week) {
      alert(`Error creating week: ${weekError?.message || "Unknown error"}`);
      setSaving(false);
      return;
    }

    // Create content pieces
    for (const piece of parsed.pieces) {
      await supabase.from("content_pieces").insert({
        week_id: week.id,
        company_id: selectedCompanyId,
        content_type: piece.content_type,
        title: piece.title,
        day_of_week: piece.day_of_week,
        scheduled_time: piece.scheduled_time,
        markdown_body: piece.markdown_body,
        first_comment: piece.first_comment,
        pillar: piece.pillar,
        audience_theme: piece.audience_theme,
        topic_bank_ref: piece.topic_bank_ref,
        word_count: piece.word_count,
        post_type: piece.post_type,
        sort_order: piece.sort_order,
      });
    }

    // If publishing, send notification
    if (publish) {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "content_ready", weekId: week.id }),
      });
    }

    router.push(`/weeks/${week.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Upload Content</h1>

      {/* Step indicators */}
      <div className="flex gap-4 text-sm">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex items-center gap-2 ${step >= s ? "text-sky-600" : "text-gray-400"}`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                step >= s ? "bg-sky-500 text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {s}
            </span>
            {s === 1 && "Select & Paste"}
            {s === 2 && "Review Parsed"}
            {s === 3 && "Confirm"}
          </div>
        ))}
      </div>

      {/* Step 1: Select company & paste markdown */}
      {step === 1 && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">Select a company...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Review Document (Markdown)
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Paste the contents of your OUTPUT_WeekNN_Review_Document.md file
            </p>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={15}
              placeholder="# WEEK 11 REVIEW DOCUMENT..."
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            onClick={handleParse}
            disabled={!selectedCompanyId || !markdown.trim()}
            className="rounded-lg bg-sky-500 px-6 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            Parse Document
          </button>
        </div>
      )}

      {/* Step 2: Review parsed content */}
      {step === 2 && parsed && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Week Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Week Number
                </label>
                <input
                  type="number"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {parsed.pillar && (
              <p className="text-sm text-gray-500">
                Pillar: {parsed.pillar} | Theme: {parsed.theme}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-3 font-semibold text-gray-900">
              Parsed Content ({parsed.pieces.length} pieces)
            </h2>
            <div className="space-y-2">
              {parsed.pieces.map((piece: ParsedPiece, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div>
                    <span className="text-xs font-medium uppercase text-gray-400">
                      {contentTypeLabels[piece.content_type]}
                    </span>
                    <p className="text-sm font-medium text-gray-900">
                      {piece.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {piece.day_of_week && `${piece.day_of_week} `}
                      {piece.scheduled_time && `at ${piece.scheduled_time} `}
                      {piece.word_count && `| ${piece.word_count} words `}
                      {piece.pillar && `| ${piece.pillar}`}
                    </p>
                  </div>
                  <Badge status="pending" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!weekNumber || !dateStart || !dateEnd}
              className="rounded-lg bg-sky-500 px-6 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm and save */}
      {step === 3 && parsed && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">
            <h2 className="font-semibold text-green-800">Ready to Save</h2>
            <p className="mt-1 text-sm text-green-700">
              Week {weekNumber} with {parsed.pieces.length} content pieces for{" "}
              {companies.find((c) => c.id === selectedCompanyId)?.name}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save as Draft"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="rounded-lg bg-sky-500 px-6 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save & Publish for Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
