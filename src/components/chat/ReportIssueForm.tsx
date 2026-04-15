"use client";

import { useState } from "react";
import { getRecentErrors, clearRecentErrors } from "@/lib/utils/error-capture";

interface ReportIssueFormProps {
  onClose?: () => void;
  onSubmitted?: (ticketId: string) => void;
}

const CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature Request" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
] as const;

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export default function ReportIssueForm({ onClose, onSubmitted }: ReportIssueFormProps) {
  const [category, setCategory] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const recentErrors = getRecentErrors();

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          pageUrl: window.location.href,
          browserInfo: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          consoleErrors: recentErrors.length > 0 ? recentErrors.join("\n---\n") : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit ticket");
      }

      const data = await res.json();
      clearRecentErrors();
      setSubmitted(true);

      if (onSubmitted && data.ticket?.id) {
        setTimeout(() => onSubmitted(data.ticket.id), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-center text-sm font-medium text-gray-900">Ticket created!</p>
        <p className="text-center text-xs text-gray-500">
          We&apos;ll look into this and get back to you.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-2 text-xs text-violet-600 hover:text-violet-700"
          >
            Back to chat
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
      <div className="space-y-4 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Report an Issue</h3>

        {/* Category pills */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat.value
                    ? "bg-violet-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="issue-title" className="mb-1.5 block text-xs font-medium text-gray-600">
            Brief summary
          </label>
          <input
            id="issue-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Calendar not loading for last week"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-violet-400 focus:bg-white"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="issue-desc" className="mb-1.5 block text-xs font-medium text-gray-600">
            What happened? What did you expect?
          </label>
          <textarea
            id="issue-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe what you were doing and what went wrong..."
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-violet-400 focus:bg-white"
            required
          />
        </div>

        {/* Priority */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Priority</label>
          <div className="flex gap-3">
            {PRIORITIES.map((p) => (
              <label key={p.value} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="radio"
                  name="priority"
                  value={p.value}
                  checked={priority === p.value}
                  onChange={(e) => setPriority(e.target.value)}
                  className="h-3.5 w-3.5 accent-violet-600"
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        {/* Context note */}
        <p className="text-[11px] text-gray-500">
          We&apos;ll automatically capture your current page, browser, and any error messages.
        </p>

        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-gray-100 px-4 py-3 flex gap-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim() || !description.trim()}
          className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
        >
          {submitting ? "Sending..." : "Send Report"}
        </button>
      </div>
    </form>
  );
}
