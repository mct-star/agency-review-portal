"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Created { pieceId: string; date: string; dayName: string; typeLabel: string; hasPhoto: boolean; warnings: string[] }
interface Result { created: Created[]; notes: string[]; transcript: string; weekStart: string }

const MAX_SECONDS = 300;

/** Say what is on this week. We plan the posts, day by day, and leave them for approval. */
export default function WeeklyInterview({ companyId }: { companyId: string }) {
  const [week, setWeek] = useState<"next" | "this">("next");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    setError(null);
    setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      // Speech needs little: 32 kbps keeps five minutes well under the upload limit.
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setBlob(new Blob(chunks.current, { type: "audio/webm" }));
      };
      rec.start(1000);
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      }), 1000);
    } catch {
      setError("We could not use the microphone. You can type it instead.");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.state === "recording" && recorder.current.stop();
    setRecording(false);
  }

  async function plan() {
    setBusy(true);
    setError(null);
    setResult(null);
    let res: Response;
    if (blob) {
      const form = new FormData();
      form.set("companyId", companyId);
      form.set("week", week);
      form.set("audio", blob, "week.webm");
      res = await fetch("/api/hospitality/week-plan", { method: "POST", body: form });
    } else {
      res = await fetch("/api/hospitality/week-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, week, transcript: text }) });
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Something went wrong. Please try again."); return; }
    setResult(data);
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const ready = !!blob || text.trim().length >= 20;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="font-medium text-gray-900">Just say what is happening, day by day.</p>
        <p className="mt-1">For example: &quot;Wednesday is a wine tasting at seven, thirty-five pounds, book on the phone. Friday we have a fish and chips deal. Sunday is the roast, book ahead.&quot;</p>
        <p className="mt-1 text-gray-600">We only use what you say. If you do not give a price or a time, it is left out.</p>
      </div>

      <fieldset className="flex gap-3 text-sm">
        <legend className="mb-1 font-medium text-gray-900">Which week</legend>
        {([["next", "Next week"], ["this", "This week"]] as const).map(([v, label]) => (
          <label key={v} className={`cursor-pointer rounded-full border px-4 py-1.5 ${week === v ? "border-violet-600 bg-violet-600 text-white" : "border-gray-300 bg-white text-gray-700"}`}>
            <input type="radio" name="week" className="sr-only" checked={week === v} onChange={() => setWeek(v)} />{label}
          </label>
        ))}
      </fieldset>

      <div className="space-y-3">
        {!recording ? (
          <button type="button" onClick={start} disabled={busy} className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {blob ? "Record it again" : "Press and talk"}
          </button>
        ) : (
          <button type="button" onClick={stop} className="rounded-lg bg-red-600 px-5 py-3 text-sm font-medium text-white hover:bg-red-700">Stop ({mm})</button>
        )}
        {recording && <p className="text-xs text-gray-600" aria-live="polite">Recording. Up to five minutes.</p>}
        {blob && !recording && <p className="text-xs text-emerald-700">Recording ready ({mm}).</p>}
        <label className="block text-sm">
          <span className="text-gray-700">Or type it</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); if (e.target.value) setBlob(null); }} rows={5} disabled={recording} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Wednesday wine tasting at 7..." />
        </label>
        <button type="button" onClick={plan} disabled={busy || recording || !ready} className="rounded-md bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {busy ? "Planning the week..." : "Plan the week"}
        </button>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      </div>

      {result && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4" aria-live="polite">
          <h2 className="text-lg font-semibold text-gray-900">{result.created.length === 0 ? "Nothing to post yet" : `${result.created.length} ${result.created.length === 1 ? "post" : "posts"} ready for you`}</h2>
          {result.created.length > 0 && (
            <ul className="divide-y divide-gray-100 text-sm">
              {result.created.map((c) => (
                <li key={c.pieceId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><strong>{c.dayName}</strong>, {c.typeLabel}</span>
                  <span className="text-xs text-gray-600">{c.hasPhoto ? "Photo chosen" : "Needs a photo"}{c.warnings.length > 0 ? ", check the figures" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {result.notes.map((n) => <p key={n} className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{n}</p>)}
          {result.created.length > 0 && (
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/approvals" className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">Look at them and approve</Link>
              <Link href="/calendar" className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">See them on the calendar</Link>
            </div>
          )}
          <details className="text-xs text-gray-600"><summary className="cursor-pointer">What we heard</summary><p className="mt-1 whitespace-pre-wrap">{result.transcript}</p></details>
        </div>
      )}
    </div>
  );
}
