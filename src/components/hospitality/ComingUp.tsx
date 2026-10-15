"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Kind = "event" | "launch";

interface Item {
  id: string;
  kind: Kind;
  title: string;
  details: string | null;
  starts_on: string;
  ends_on: string | null;
  start_time: string | null;
  build_up: { week: boolean; two_days: boolean; day_of: boolean };
  status: "active" | "cancelled";
  next: string;
}

interface Found {
  kind: Kind;
  title: string;
  details: string | null;
  startsOn: string;
  endsOn: string | null;
  time: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const KIND_LABEL: Record<Kind, string> = { event: "Event", launch: "New dish, menu or offer" };
const BUILD_UP: { key: keyof Item["build_up"]; label: string }[] = [
  { key: "week", label: "7 days before" },
  { key: "two_days", label: "2 days before" },
  { key: "day_of", label: "On the day" },
];

const button = "inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50";
const input = "mt-1 block min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm";

/**
 * The venue's Coming up list: events and launches by date, the next post each
 * will draft, switches for an event's three build-up posts, cancel, a quick
 * add form, and an upload that shows what it found before anything is saved.
 */
export default function ComingUp({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [today, setToday] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [found, setFound] = useState<(Found & { tick: boolean })[] | null>(null);
  const [foundNotes, setFoundNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/hospitality/coming-up?companyId=${encodeURIComponent(companyId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The list could not be loaded.");
      setItems(body.items);
      setToday(body.today);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, change: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/hospitality/coming-up/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "That change did not save. Try again.");
      return;
    }
    setItems((list) => list.map((i) => (i.id === id ? body.item : i)));
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFound(null);
    setFoundNotes([]);
    try {
      const form = new FormData();
      form.set("companyId", companyId);
      form.set("file", file, file.name);
      const res = await fetch("/api/hospitality/coming-up/extract", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We could not read that file.");
      setFound((body.found as Found[]).map((f) => ({ ...f, tick: true })));
      setFoundNotes(body.notes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not read that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmFound() {
    if (!found) return;
    const ticked = found.filter((f) => f.tick).map(({ tick: _tick, ...f }) => f);
    if (ticked.length === 0) {
      setFound(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hospitality/coming-up/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, items: ticked }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Those could not be added.");
      setFound(null);
      setFoundNotes([]);
      const n = (body.added as Item[]).length;
      setMessage([`Added ${n} to Coming up.`, ...((body.notes as string[]) || [])].join(" "));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those could not be added.");
    } finally {
      setBusy(false);
    }
  }

  const upcoming = items.filter((i) => (i.ends_on ?? i.starts_on) >= today);
  const recent = items.filter((i) => (i.ends_on ?? i.starts_on) < today);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => setAdding((a) => !a)} className={`${button} bg-violet-600 text-white hover:bg-violet-700`}>
          {adding ? "Close the form" : "Add something"}
        </button>
        <label className={`${button} cursor-pointer border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Reading it..." : "Upload a list, a photo or a calendar"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.ics,text/calendar"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {adding && (
        <QuickAdd
          companyId={companyId}
          onAdded={(item) => {
            setItems((list) => [...list, item].sort((a, b) => a.starts_on.localeCompare(b.starts_on)));
            setMessage(`${item.title} is on the list. ${item.next}.`);
            setAdding(false);
          }}
        />
      )}

      {found && (
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <h2 className="text-base font-semibold text-gray-900">We found these. Tick the ones to add.</h2>
          {found.length === 0 && <p className="mt-2 text-sm text-gray-600">We could not find anything with a date in that.</p>}
          <ul className="mt-3 space-y-2">
            {found.map((f, i) => (
              <li key={`${f.title}-${f.startsOn}-${i}`}>
                <label className="flex min-h-[44px] items-start gap-3 rounded-lg bg-white p-3">
                  <input
                    type="checkbox"
                    checked={f.tick}
                    onChange={() => setFound((list) => list!.map((x, j) => (j === i ? { ...x, tick: !x.tick } : x)))}
                    className="mt-1 h-5 w-5"
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium text-gray-900">{f.title}</span>
                    <span className="block text-gray-600">
                      {dateLabel(f.startsOn)}
                      {f.endsOn ? ` to ${dateLabel(f.endsOn)}` : ""}
                      {f.time ? `, ${f.time}` : ""}
                    </span>
                    {f.details && <span className="block break-words text-gray-500">{f.details}</span>}
                    <select
                      value={f.kind}
                      onChange={(e) => setFound((list) => list!.map((x, j) => (j === i ? { ...x, kind: e.target.value as Kind } : x)))}
                      className="mt-2 min-h-[44px] rounded-lg border border-gray-300 px-2 text-sm"
                      aria-label={`What ${f.title} is`}
                    >
                      <option value="event">Event</option>
                      <option value="launch">New dish, menu or offer</option>
                    </select>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {foundNotes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              {foundNotes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => void confirmFound()} className={`${button} bg-violet-600 text-white hover:bg-violet-700`}>
              Add the ticked ones
            </button>
            <button type="button" onClick={() => setFound(null)} className={`${button} border border-gray-300 bg-white text-gray-800`}>
              Do not add any
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading the list...</p>
      ) : upcoming.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-600">
          Nothing coming up yet. Add a quiz night, a new menu or an offer, or mention them when you talk through the week, and the posts will be drafted for you at the right time.
        </p>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((item) => <ItemCard key={item.id} item={item} onChange={(c) => void patch(item.id, c)} />)}
        </ul>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">The last seven days</h2>
          <ul className="mt-2 space-y-3 opacity-70">
            {recent.map((item) => <ItemCard key={item.id} item={item} onChange={(c) => void patch(item.id, c)} past />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function ItemCard({ item, onChange, past = false }: { item: Item; onChange: (change: Record<string, unknown>) => void; past?: boolean }) {
  const cancelled = item.status === "cancelled";
  return (
    <li className={`rounded-xl border bg-white p-4 ${cancelled ? "border-gray-200 opacity-60" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">
          {dateLabel(item.starts_on)}
          {item.ends_on ? ` to ${dateLabel(item.ends_on)}` : ""}
          {item.start_time ? `, ${item.start_time}` : ""}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.kind === "event" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"}`}>{KIND_LABEL[item.kind]}</span>
        {cancelled && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Cancelled</span>}
      </div>
      <p className={`mt-1 break-words text-base font-medium text-gray-900 ${cancelled ? "line-through" : ""}`}>{item.title}</p>
      {item.details && <p className="mt-1 break-words text-sm text-gray-600">{item.details}</p>}
      {!past && <p className="mt-2 text-sm text-violet-700">{item.next}</p>}

      {!past && !cancelled && item.kind === "event" && (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-gray-500">Posts before it</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {BUILD_UP.map((b) => (
              <label key={b.key} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700">
                <input type="checkbox" className="h-5 w-5" checked={item.build_up[b.key]} onChange={(e) => onChange({ buildUp: { [b.key]: e.target.checked } })} />
                {b.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {!past && (
        <div className="mt-3">
          {cancelled ? (
            <button type="button" onClick={() => onChange({ status: "active" })} className={`${button} border border-gray-300 bg-white text-gray-800`}>
              Bring it back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Cancel ${item.title}? No more posts will be drafted for it.`)) onChange({ status: "cancelled" });
              }}
              className={`${button} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
            >
              Cancel it
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function QuickAdd({ companyId, onAdded }: { companyId: string; onAdded: (item: Item) => void }) {
  const [kind, setKind] = useState<Kind>("event");
  const [title, setTitle] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [time, setTime] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hospitality/coming-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, kind, title, startsOn, endsOn: endsOn || null, time: time || null, details }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That could not be added.");
      onAdded(body.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">What is it?</legend>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          {(["event", "launch"] as Kind[]).map((k) => (
            <label key={k} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="h-5 w-5" />
              {k === "event" ? "An event, like a quiz night or live music" : "A new dish, menu or offer"}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-gray-700">
        Name it in your own words
        <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === "event" ? "Quiz night" : "New autumn menu"} className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-gray-700">
          {kind === "event" ? "Date" : "Starts"}
          <input required type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {kind === "event" ? "Ends (optional)" : "Until (optional)"}
          <input type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Time (optional)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block text-sm font-medium text-gray-700">
        Details: price, how to book, what is in it
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <p className="text-xs text-gray-500">
        {kind === "event"
          ? "We draft a post seven days before, two days before and on the day. You approve each one."
          : "We draft a post on the day it starts and, if it runs four days or more, one partway through. You approve each one."}
      </p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className={`${button} w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto`}>
        {busy ? "Adding..." : "Add to Coming up"}
      </button>
    </form>
  );
}
