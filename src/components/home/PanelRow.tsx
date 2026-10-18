"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionRow, Verb } from "@/lib/admin-home/types";

/**
 * One row on an admin home panel. Each verb calls its route, says what
 * happened next to the row, and refreshes the page data. A verb that fails
 * shows the server's plain message; it never pretends.
 */
export default function PanelRow({ row }: { row: ActionRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(verb: Verb) {
    if (verb.confirm && !window.confirm(verb.confirm)) return;
    setBusy(verb.label);
    setNote(null);
    try {
      const res = await fetch(verb.path, {
        method: verb.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verb.body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({ ok: false, text: data.error || `That did not work (${res.status}).` });
      } else {
        setNote({ ok: true, text: `${verb.label}: done.` });
        router.refresh();
      }
    } catch {
      setNote({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  const toneClass = (tone?: Verb["tone"]) =>
    tone === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : tone === "primary"
        ? "border-violet-600 bg-violet-600 text-white hover:bg-violet-700"
        : "border-gray-300 text-gray-700 hover:bg-gray-50";

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <Link href={row.href} className="block text-sm font-medium text-gray-900 hover:underline [overflow-wrap:anywhere]">
          {row.title}
        </Link>
        <p className="mt-1 text-xs text-gray-600 [overflow-wrap:anywhere]">
          {row.sub}
          {row.ageLabel ? <span className="text-gray-400"> · {row.ageLabel}</span> : null}
        </p>
        {note && (
          <p className={`text-xs ${note.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {note.text}
          </p>
        )}
      </div>
      {row.verbs.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {row.verbs.map((verb) => (
            <button
              key={verb.label}
              type="button"
              disabled={busy !== null}
              onClick={() => run(verb)}
              className={`min-h-11 rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${toneClass(verb.tone)}`}
            >
              {busy === verb.label ? "Working..." : verb.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
