"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { dateInWeek } from "@/lib/calendar/schedule";

/**
 * The planning board (27 Sept 2026): posts sent to review wait in the
 * Unscheduled tray as thumbnails; drag one onto any day of the next four
 * weeks, or back to the tray. On a phone, tap a thumbnail, then tap a day.
 * Placing a post sets its week, day and date together (PATCH
 * /api/calendar/reschedule with a date). Approval stays in Review; the
 * coloured edge shows where each post stands.
 */

interface PlanPiece {
  id: string;
  title: string;
  post_type: string | null;
  approval_status: string;
  week_id: string;
  day_of_week: string | null;
  scheduled_date: string | null;
  markdown_body: string;
  cover_image_url: string | null;
}
interface PlanWeekRow { id: string; week_number: number; date_start: string; date_end: string }

const WEEKS_SHOWN = 4;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EDGE: Record<string, string> = {
  approved: "border-l-green-500",
  changes_requested: "border-l-amber-500",
  pending: "border-l-gray-300",
};
const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  pending: "Awaiting review",
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function mondayOf(date: string): string {
  const js = new Date(`${date}T12:00:00`).getDay();
  return addDaysIso(date, js === 0 ? -6 : 1 - js);
}
function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function firstLine(md: string): string {
  const line = (md || "").split("\n").map((l) => l.replace(/[#*_>`]/g, "").trim()).find(Boolean) || "";
  return line.length > 90 ? `${line.slice(0, 88)}...` : line;
}
function label(slug: string | null): string {
  return (slug || "post").replace(/_/g, " ");
}

function Thumb({ piece, selected, onSelect }: { piece: PlanPiece; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: piece.id, data: { piece } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      title={`${label(piece.post_type)}, ${STATUS_LABEL[piece.approval_status] || piece.approval_status}. Tap, then tap a day.`}
      className={`group cursor-grab rounded-md border border-gray-200 border-l-4 ${EDGE[piece.approval_status] || EDGE.pending} bg-white shadow-sm transition ${
        selected ? "ring-2 ring-violet-500" : "hover:shadow"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <ThumbBody piece={piece} />
    </div>
  );
}

function ThumbBody({ piece }: { piece: PlanPiece }) {
  return (
    <div className="flex gap-2 p-1.5">
      {piece.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={piece.cover_image_url} alt="" className="h-12 w-10 flex-shrink-0 rounded object-cover bg-gray-100" loading="lazy" />
      ) : (
        <div className="flex h-12 w-10 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-semibold uppercase text-gray-500">
          Text
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold capitalize text-gray-700">{label(piece.post_type)}</p>
        <p className="line-clamp-2 text-[11px] leading-snug text-gray-600">{firstLine(piece.markdown_body) || piece.title}</p>
      </div>
    </div>
  );
}

function DropZone({ id, date, className, children, onTap }: {
  id: string; date: string | null; className: string; children: React.ReactNode; onTap: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id, data: { date } });
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => { if (e.target === e.currentTarget) onTap(); }}
      className={`${className} ${isOver ? "outline outline-2 outline-dashed outline-violet-500 -outline-offset-2" : ""}`}
    >
      {children}
    </div>
  );
}

export default function PlanBoard({ companyId }: { companyId: string }) {
  const [start, setStart] = useState(() => mondayOf(iso(new Date())));
  const [weeks, setWeeks] = useState<PlanWeekRow[]>([]);
  const [pieces, setPieces] = useState<PlanPiece[]>([]);
  const [tray, setTray] = useState<PlanPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<PlanPiece | null>(null);
  const today = iso(new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = addDaysIso(start, WEEKS_SHOWN * 7 - 1);
      const res = await fetch(`/api/calendar?companyId=${companyId}&start=${start}&end=${end}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not load the plan");
      setWeeks(json.weeks || []);
      setPieces(json.pieces || []);
      setTray(json.unscheduled || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the plan");
    } finally {
      setLoading(false);
    }
  }, [companyId, start]);

  useEffect(() => { load(); }, [load]);

  // Each placed post's date: its scheduled date, else its day in its week.
  const byDate = useMemo(() => {
    const weekStart = new Map(weeks.map((w) => [w.id, w.date_start]));
    const map: Record<string, PlanPiece[]> = {};
    for (const p of pieces) {
      const date = p.scheduled_date || dateInWeek(weekStart.get(p.week_id) || "", p.day_of_week);
      if (!date) continue;
      (map[date] ||= []).push(p);
    }
    return map;
  }, [pieces, weeks]);

  const all = useMemo(() => [...tray, ...pieces], [tray, pieces]);

  async function place(pieceId: string, date: string | null) {
    const piece = all.find((p) => p.id === pieceId);
    if (!piece) return;
    setSelected(null);
    const current = piece.scheduled_date || null;
    const inTray = tray.some((p) => p.id === pieceId);
    if ((date === null && inTray) || (date !== null && date === current)) return;

    // Move it on screen straight away; the server's answer settles it.
    const moved = { ...piece, scheduled_date: date, day_of_week: date ? piece.day_of_week : null };
    const before = { tray, pieces };
    if (date === null) {
      setPieces((ps) => ps.filter((p) => p.id !== pieceId));
      setTray((ts) => [moved, ...ts.filter((p) => p.id !== pieceId)]);
    } else {
      setTray((ts) => ts.filter((p) => p.id !== pieceId));
      setPieces((ps) => [...ps.filter((p) => p.id !== pieceId), moved]);
    }
    try {
      const res = await fetch("/api/calendar/reschedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId, date }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not move it");
      setError(null);
      if (date !== null) {
        setPieces((ps) => ps.map((p) => (p.id === pieceId ? { ...p, week_id: json.week_id, day_of_week: json.day_of_week, scheduled_date: json.scheduled_date } : p)));
      }
    } catch (e) {
      setTray(before.tray);
      setPieces(before.pieces);
      setError(e instanceof Error ? e.message : "Could not move it");
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.piece as PlanPiece) || null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    place(String(e.active.id), (e.over.data.current?.date as string | null) ?? null);
  }

  const weekRows = Array.from({ length: WEEKS_SHOWN }, (_, i) => addDaysIso(start, i * 7));
  const weekFor = (monday: string) => weeks.find((w) => w.week_number > 0 && w.date_start <= addDaysIso(monday, 6) && w.date_end >= monday);
  const tapTarget = (date: string | null) => () => { if (selected) place(selected, date); };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            {selected ? "Now tap a day, or the tray, to place it." : "Drag a post onto a day. On a phone, tap it, then tap a day."}
          </p>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white">
            <button onClick={() => setStart(addDaysIso(start, -7))} className="px-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900" aria-label="Earlier week">&larr;</button>
            <button onClick={() => setStart(mondayOf(today))} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">This week</button>
            <button onClick={() => setStart(addDaysIso(start, 7))} className="px-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900" aria-label="Later week">&rarr;</button>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex flex-col gap-4 lg:flex-row">
          <DropZone
            id="tray"
            date={null}
            onTap={tapTarget(null)}
            className="w-full flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-2 lg:w-60"
          >
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500" onClick={tapTarget(null)}>
              Unscheduled ({tray.length})
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {tray.map((p) => (
                <Thumb key={p.id} piece={p} selected={selected === p.id} onSelect={() => setSelected(selected === p.id ? null : p.id)} />
              ))}
            </div>
            {tray.length === 0 && !loading && (
              <p className="px-1 py-4 text-xs text-gray-500" onClick={tapTarget(null)}>
                Nothing waiting. Posts you send to review from Quick Generate land here.
              </p>
            )}
          </DropZone>

          <div className="min-w-0 flex-1 space-y-3">
            {loading && <p className="text-sm text-gray-500">Loading the plan...</p>}
            {weekRows.map((monday) => {
              const week = weekFor(monday);
              return (
                <section key={monday} className="rounded-lg border border-gray-200 bg-white">
                  <header className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
                    <h3 className="text-xs font-semibold text-gray-700">
                      {week ? `Week ${week.week_number}` : "No content week yet"}
                      <span className="ml-2 font-normal text-gray-500">{shortDate(monday)} to {shortDate(addDaysIso(monday, 6))}</span>
                    </h3>
                    {week && (
                      <Link href={`/review/${week.id}`} className="text-xs text-violet-600 hover:text-violet-800">Review this week</Link>
                    )}
                  </header>
                  <div className="grid grid-cols-1 sm:grid-cols-7">
                    {DAY_LABELS.map((day, i) => {
                      const date = addDaysIso(monday, i);
                      const dayPieces = byDate[date] || [];
                      return (
                        <DropZone
                          key={date}
                          id={date}
                          date={date}
                          onTap={tapTarget(date)}
                          className={`min-h-24 border-gray-100 p-1.5 sm:border-l first:sm:border-l-0 ${date === today ? "bg-violet-50/50" : ""} ${date < today ? "opacity-60" : ""} ${selected ? "cursor-pointer" : ""}`}
                        >
                          <p className={`mb-1 text-[11px] font-medium ${date === today ? "text-violet-700" : "text-gray-500"}`} onClick={tapTarget(date)}>
                            {day} {shortDate(date)}
                          </p>
                          <div className="space-y-1.5">
                            {dayPieces.map((p) => (
                              <Thumb key={p.id} piece={p} selected={selected === p.id} onSelect={() => setSelected(selected === p.id ? null : p.id)} />
                            ))}
                          </div>
                        </DropZone>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <p className="flex flex-wrap gap-4 text-[11px] text-gray-500">
              <span><span className="mr-1 inline-block h-2.5 w-1 bg-green-500 align-middle" />Approved</span>
              <span><span className="mr-1 inline-block h-2.5 w-1 bg-gray-300 align-middle" />Awaiting review</span>
              <span><span className="mr-1 inline-block h-2.5 w-1 bg-amber-500 align-middle" />Changes requested</span>
            </p>
          </div>
        </div>
      </div>

      <DragOverlay>
        {dragging ? (
          <div className={`w-52 rounded-md border border-gray-200 border-l-4 ${EDGE[dragging.approval_status] || EDGE.pending} bg-white shadow-lg`}>
            <ThumbBody piece={dragging} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
