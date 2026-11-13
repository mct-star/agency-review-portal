"use client";

import { useEffect, useState } from "react";
import type { CadenceMode } from "@/types/database";
import { MAX_REMINDER_RECIPIENTS } from "@/lib/cadence/validate";

const MODES: { value: CadenceMode; label: string; line: string }[] = [
  {
    value: "weekly_batch",
    label: "One sitting a week",
    line: "You get one reminder when the week is ready to review, and one when it is approved and ready to deploy.",
  },
  {
    value: "daily",
    label: "A post every day",
    line: "You get a reminder each day for that day's post.",
  },
  {
    value: "posting_days",
    label: "Posting days only",
    line: "You get a reminder only on the days that have a post in the schedule below.",
  },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function CadenceSettings({ companyId }: { companyId: string }) {
  const [mode, setMode] = useState<CadenceMode>("weekly_batch");
  const [hour, setHour] = useState(8);
  const [recipients, setRecipients] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/config/company-cadence?companyId=${companyId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (cancelled) return;
        setMode(json.data.mode);
        setHour(json.data.reminder_hour);
        setRecipients((json.data.reminder_recipients as string[]).join("\n"));
      } catch (err) {
        if (!cancelled) setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not load reminder settings" });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const list = recipients.split(/[\s,;]+/).filter(Boolean);
      const res = await fetch("/api/config/company-cadence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, mode, reminderHour: hour, reminderRecipients: list }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRecipients((json.data.reminder_recipients as string[]).join("\n"));
      setMessage({ kind: "ok", text: "Reminder settings saved." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not save reminder settings" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="cadence-heading" className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 id="cadence-heading" className="text-sm font-semibold text-gray-900">Review rhythm and reminders</h2>
      <p className="mt-1 text-xs text-gray-500">
        How often you sit down to review and approve content, and who is reminded. Times use the company timezone.
      </p>

      <fieldset className="mt-4 space-y-2" disabled={!loaded || saving}>
        <legend className="sr-only">Review rhythm</legend>
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
              mode === m.value ? "border-sky-400 bg-sky-50" : "border-gray-200"
            }`}
          >
            <input
              type="radio"
              name="cadence-mode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{m.label}</span>
              <span className="block text-xs text-gray-500">{m.line}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cadence-hour" className="mb-1 block text-xs font-medium text-gray-500">Reminder hour</label>
          <select
            id="cadence-hour"
            value={hour}
            disabled={!loaded || saving}
            onChange={(e) => setHour(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cadence-recipients" className="mb-1 block text-xs font-medium text-gray-500">
            Reminder email addresses (up to {MAX_REMINDER_RECIPIENTS}, one per line)
          </label>
          <textarea
            id="cadence-recipients"
            rows={3}
            value={recipients}
            disabled={!loaded || saving}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="name@company.com"
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-gray-500">Leave empty to send no reminders.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {message && (
          <p role="status" className={`text-xs ${message.kind === "ok" ? "text-green-700" : "text-red-700"}`}>
            {message.text}
          </p>
        )}
        <button
          onClick={save}
          disabled={!loaded || saving}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save reminder settings"}
        </button>
      </div>
    </section>
  );
}
