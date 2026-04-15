"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatWeekLabelShort } from "@/lib/utils/format-week-label";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";

// ── Types ────────────────────────────────────────────────────

interface CompanyOption {
  id: string;
  name: string;
  brand_color: string | null;
}

interface CalendarPiece {
  id: string;
  title: string;
  content_type: string;
  day_of_week: string | null;
  scheduled_time: string | null;
  post_type: string | null;
  approval_status: string;
  image_generation_status: string;
  week_id: string;
  markdown_body: string;
  cover_image_url: string | null;
  first_comment: string | null;
}

interface CalendarWeek {
  id: string;
  week_number: number;
  year: number;
  date_start: string;
  date_end: string;
  title: string | null;
  pillar: string | null;
  theme: string | null;
  status: string;
}

interface TemplateSlot {
  id: string;
  day_of_week: number;
  scheduled_time: string;
  slot_label: string | null;
  image_archetype: string | null;
  post_type_id: string;
  post_types: { slug: string; label: string; content_type: string } | null;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  pieces: CalendarPiece[];
  templateSlots: TemplateSlot[];
  week: CalendarWeek | null;
}

interface ContentCalendarProps {
  companies: CompanyOption[];
  showCompanyPicker?: boolean;
}

type ViewMode = "month" | "week" | "search" | "recent";

// ── Constants ────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MAP: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
  Friday: 5, Saturday: 6, Sunday: 0,
};
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Grid index (0=Mon...6=Sun) to full day name for the reschedule API
const GRID_TO_DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const POST_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  problem_post: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", accent: "#86efac" },
  insight: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", accent: "#86efac" },
  launch_story: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", accent: "#6ee7b7" },
  if_i_was: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", accent: "#c084fc" },
  contrarian: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", accent: "#93c5fd" },
  tactical: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", accent: "#fde047" },
  founder_friday: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", accent: "#fdba74" },
  blog_teaser: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", accent: "#a78bfa" },
  blog_cta: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", accent: "#f9a8d4" },
  triage_cta: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", accent: "#fda4af" },
  weekend_personal: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", accent: "#fcd34d" },
  blog_article: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", accent: "#a5b4fc" },
  linkedin_article: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", accent: "#7dd3fc" },
};

const STATUS_BG: Record<string, string> = {
  pending: "bg-gray-100",
  approved: "bg-green-50",
  changes_requested: "bg-amber-50",
};

// ── LinkedIn "in" icon SVG ──────────────────────────────────

function LinkedInIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m}${suffix}`;
}

function getPostTypeLabel(slug: string | null): string {
  if (!slug) return "";
  const labels: Record<string, string> = {
    problem_post: "Mistake", insight: "Mistake",
    launch_story: "Launch", if_i_was: "If I Was",
    contrarian: "Contrarian", tactical: "Tactical",
    founder_friday: "Founder Fri", blog_teaser: "Blog Teaser",
    blog_cta: "Blog CTA", triage_cta: "Triage CTA",
    weekend_personal: "Personal", blog_article: "Blog",
    linkedin_article: "LI Article",
  };
  return labels[slug] || slug.replace(/_/g, " ");
}

function stripMarkdown(md: string): string {
  return md.replace(/[#*_\[\]()>\n`~|]/g, " ").replace(/\s+/g, " ").trim();
}

// Map piece to actual date based on week's date_start + day_of_week
function getPieceDate(piece: CalendarPiece, week: CalendarWeek): Date | null {
  if (!piece.day_of_week) return null;
  const dayNum = DAY_MAP[piece.day_of_week];
  if (dayNum === undefined) return null;

  const weekStart = new Date(week.date_start + "T00:00:00");
  const monday = getMonday(weekStart);

  const offset = dayNum === 0 ? 6 : dayNum - 1;
  return addDays(monday, offset);
}

// Convert JS getDay() (0=Sun) to grid index (0=Mon...6=Sun)
function jsToGridDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// Convert template slot day_of_week (0=Sun) to grid index
function slotToGridDay(slotDay: number): number {
  return slotDay === 0 ? 6 : slotDay - 1;
}

// Sort pieces by scheduled_time ascending, nulls last
function sortByTime(pieces: CalendarPiece[]): CalendarPiece[] {
  return [...pieces].sort((a, b) => {
    if (!a.scheduled_time && !b.scheduled_time) return 0;
    if (!a.scheduled_time) return 1;
    if (!b.scheduled_time) return -1;
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });
}

// ── Draggable Pill wrapper ──────────────────────────────────

function DraggablePill({
  piece,
  children,
}: {
  piece: CalendarPiece;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: piece.id,
    data: { piece },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}
    >
      {children}
    </div>
  );
}

// ── Droppable Day wrapper ───────────────────────────────────

function DroppableDay({
  dateKey,
  date,
  children,
}: {
  dateKey: string;
  date: Date;
  children: React.ReactNode;
}) {
  const gridDay = jsToGridDay(date.getDay());
  const dayName = GRID_TO_DAY_NAME[gridDay];
  const { isOver, setNodeRef } = useDroppable({
    id: dateKey,
    data: { date, dayName },
  });

  return (
    <div
      ref={setNodeRef}
      style={isOver ? { outline: "2px dashed #8b5cf6", outlineOffset: "-2px" } : undefined}
    >
      {children}
    </div>
  );
}

// ── Preview Popover ─────────────────────────────────────────

function PiecePopover({
  piece,
  onClose,
  anchorRef,
}: {
  piece: CalendarPiece;
  onClose: () => void;
  anchorRef: HTMLElement | null;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const colors = POST_TYPE_COLORS[piece.post_type || ""] || {
    bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", accent: "#d1d5db",
  };
  const statusLabel =
    piece.approval_status === "approved" ? "Approved" :
    piece.approval_status === "changes_requested" ? "Changes Requested" : "Pending";
  const statusColor =
    piece.approval_status === "approved" ? "bg-green-100 text-green-700" :
    piece.approval_status === "changes_requested" ? "bg-amber-100 text-amber-700" :
    "bg-gray-100 text-gray-600";

  const bodyPreview = piece.markdown_body
    ? stripMarkdown(piece.markdown_body).slice(0, 200)
    : "";

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-lg p-4"
      style={{ top: "100%", left: 0, marginTop: 4 }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-600"
        aria-label="Close preview"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {piece.cover_image_url && (
          <img
            src={piece.cover_image_url}
            alt=""
            className="h-12 w-12 rounded-lg object-cover flex-shrink-0 bg-gray-100"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
            {piece.title || "Untitled post"}
          </p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${statusColor}`}>
              {statusLabel}
            </span>
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
              {getPostTypeLabel(piece.post_type)}
            </span>
          </div>
        </div>
      </div>

      {piece.scheduled_time && (
        <p className="mt-2 text-xs text-gray-500">
          Scheduled: {formatTime(piece.scheduled_time)}
          {piece.day_of_week ? `, ${piece.day_of_week}` : ""}
        </p>
      )}

      {bodyPreview && (
        <p className="mt-2 text-xs text-gray-500 leading-relaxed line-clamp-4">
          {bodyPreview}
        </p>
      )}

      <div className="mt-3 border-t border-gray-100 pt-2">
        <Link
          href={`/content/${piece.id}`}
          className="text-xs font-medium text-violet-600 hover:text-violet-800"
        >
          Open full &rarr;
        </Link>
      </div>
    </div>
  );
}

// ── "+N more" Popover ───────────────────────────────────────

function MorePiecesPopover({
  pieces,
  expandedPieceId,
  setExpandedPieceId,
  onClose,
}: {
  pieces: CalendarPiece[];
  expandedPieceId: string | null;
  setExpandedPieceId: (id: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-40 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-1.5 space-y-0.5"
      style={{ top: "100%", left: 0, marginTop: 2 }}
    >
      {pieces.map((piece) => {
        const colors = POST_TYPE_COLORS[piece.post_type || ""] || {
          bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", accent: "#d1d5db",
        };
        const statusBg = STATUS_BG[piece.approval_status] || "bg-gray-100";
        return (
          <div key={piece.id} className="relative">
            <DraggablePill piece={piece}>
              <button
                onClick={() => setExpandedPieceId(expandedPieceId === piece.id ? null : piece.id)}
                className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight truncate ${statusBg}`}
                style={{ borderLeft: `3px solid ${colors.accent}` }}
                title={piece.title}
              >
                <div className="flex items-center gap-1">
                  {piece.cover_image_url && (
                    <img src={piece.cover_image_url} alt="" className="h-4 w-4 rounded object-cover flex-shrink-0 bg-gray-100" loading="lazy" />
                  )}
                  <span className="truncate">
                    {piece.scheduled_time ? formatTime(piece.scheduled_time) + " " : ""}
                    {getPostTypeLabel(piece.post_type)}
                  </span>
                  <LinkedInIcon className="h-2.5 w-2.5 text-[#0A66C2] flex-shrink-0 ml-auto" />
                </div>
              </button>
            </DraggablePill>
            {expandedPieceId === piece.id && (
              <PiecePopover piece={piece} onClose={() => setExpandedPieceId(null)} anchorRef={null} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ContentCalendar({
  companies,
  showCompanyPicker = false,
}: ContentCalendarProps) {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weeks, setWeeks] = useState<CalendarWeek[]>([]);
  const [pieces, setPieces] = useState<CalendarPiece[]>([]);
  const [templateSlots, setTemplateSlots] = useState<TemplateSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplate, setShowTemplate] = useState(true);

  // Search & recent
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CalendarPiece[]>([]);
  const [searchWeeks, setSearchWeeks] = useState<CalendarWeek[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode>("month");

  // Popover state
  const [expandedPieceId, setExpandedPieceId] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  // Drag state
  const [activeDragPiece, setActiveDragPiece] = useState<CalendarPiece | null>(null);

  // Timezone (client-side only to avoid SSR mismatch)
  const [timezone, setTimezone] = useState<string>("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Keyboard navigation
  const navigateRef = useRef<(dir: -1 | 1) => void>(undefined);
  const goToTodayRef = useRef<() => void>(undefined);

  // Fetch data for the visible date range
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const rangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const rangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);

      const startStr = formatDateKey(rangeStart);
      const endStr = formatDateKey(rangeEnd);

      const res = await fetch(
        `/api/calendar?companyId=${selectedCompany.id}&start=${startStr}&end=${endStr}`
      );
      if (!res.ok) throw new Error("Failed to load calendar data");

      const json = await res.json();
      setWeeks(json.weeks || []);
      setPieces(json.pieces || []);
      setTemplateSlots(json.slots || []);
    } catch {
      // empty calendar is fine
    } finally {
      setLoading(false);
    }
  }, [selectedCompany.id, currentDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build date-to-pieces mapping
  const piecesByDate: Record<string, { pieces: CalendarPiece[]; week: CalendarWeek | null }> = {};
  for (const week of weeks) {
    const weekPieces = pieces.filter((p) => p.week_id === week.id);
    for (const piece of weekPieces) {
      const date = getPieceDate(piece, week);
      if (date) {
        const key = formatDateKey(date);
        if (!piecesByDate[key]) piecesByDate[key] = { pieces: [], week };
        piecesByDate[key].pieces.push(piece);
        piecesByDate[key].week = week;
      }
    }
  }

  // Get template slots for a given grid day index (0=Mon...6=Sun)
  function getSlotsForGridDay(gridDay: number): TemplateSlot[] {
    const slotDay = gridDay === 6 ? 0 : gridDay + 1;
    return templateSlots.filter((s) => s.day_of_week === slotDay);
  }

  // Check if a template slot is filled by an actual piece
  function isSlotFilled(slot: TemplateSlot, dayPieces: CalendarPiece[]): boolean {
    const slotSlug = slot.post_types?.slug;
    if (!slotSlug) return false;
    return dayPieces.some((p) => p.post_type === slotSlug);
  }

  // Generate grid cells
  function getMonthGrid(): DayCell[][] {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    const gridStart = getMonday(firstOfMonth);
    const rows: DayCell[][] = [];
    let d = new Date(gridStart);

    while (d <= lastOfMonth || rows.length < 5) {
      const row: DayCell[] = [];
      for (let i = 0; i < 7; i++) {
        const key = formatDateKey(d);
        const data = piecesByDate[key];
        const gridDay = jsToGridDay(d.getDay());
        const daySlots = showTemplate ? getSlotsForGridDay(gridDay) : [];
        const dayPieces = data?.pieces || [];
        const unfilledSlots = daySlots.filter((s) => !isSlotFilled(s, dayPieces));

        row.push({
          date: new Date(d),
          isCurrentMonth: d.getMonth() === month,
          isToday: isSameDay(d, today),
          pieces: sortByTime(dayPieces),
          templateSlots: unfilledSlots,
          week: data?.week || null,
        });
        d = addDays(d, 1);
      }
      rows.push(row);
      if (d.getMonth() !== month && rows.length >= 4) break;
    }

    return rows;
  }

  function getWeekGrid(): DayCell[] {
    const monday = getMonday(currentDate);
    const cells: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const key = formatDateKey(d);
      const data = piecesByDate[key];
      const gridDay = jsToGridDay(d.getDay());
      const daySlots = showTemplate ? getSlotsForGridDay(gridDay) : [];
      const dayPieces = data?.pieces || [];
      const unfilledSlots = daySlots.filter((s) => !isSlotFilled(s, dayPieces));

      cells.push({
        date: d,
        isCurrentMonth: d.getMonth() === currentDate.getMonth(),
        isToday: isSameDay(d, today),
        pieces: sortByTime(dayPieces),
        templateSlots: unfilledSlots,
        week: data?.week || null,
      });
    }
    return cells;
  }

  // Navigation
  function navigate(direction: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + direction);
    } else {
      d.setDate(d.getDate() + 7 * direction);
    }
    setCurrentDate(d);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  // Keep refs in sync for keyboard handler
  navigateRef.current = navigate;
  goToTodayRef.current = goToToday;

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateRef.current?.(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateRef.current?.(1);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        goToTodayRef.current?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Drag-and-drop handlers
  function handleDragStart(event: DragStartEvent) {
    const piece = event.active.data.current?.piece as CalendarPiece | undefined;
    if (piece) setActiveDragPiece(piece);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragPiece(null);
    const { active, over } = event;
    if (!over) return;

    const piece = active.data.current?.piece as CalendarPiece | undefined;
    const dayName = over.data.current?.dayName as string | undefined;
    if (!piece || !dayName) return;

    // Don't update if same day
    if (piece.day_of_week === dayName) return;

    // Optimistic update
    setPieces((prev) =>
      prev.map((p) => (p.id === piece.id ? { ...p, day_of_week: dayName } : p))
    );

    try {
      const res = await fetch("/api/calendar/reschedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieceId: piece.id, newDayOfWeek: dayName }),
      });
      if (!res.ok) {
        // Revert on failure
        setPieces((prev) =>
          prev.map((p) => (p.id === piece.id ? { ...p, day_of_week: piece.day_of_week } : p))
        );
      }
    } catch {
      // Revert on error
      setPieces((prev) =>
        prev.map((p) => (p.id === piece.id ? { ...p, day_of_week: piece.day_of_week } : p))
      );
    }
  }

  // Search & recent data fetching
  const fetchSearchResults = useCallback(async (q: string, mode: "search" | "recent", statusFilter?: string) => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ companyId: selectedCompany.id, mode });
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/calendar/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      setSearchResults(json.pieces || []);
      setSearchWeeks(json.weeks || []);
    } catch {
      setSearchResults([]);
      setSearchWeeks([]);
    } finally {
      setSearchLoading(false);
    }
  }, [selectedCompany.id]);

  // Handle entering search/recent mode
  function enterSearchMode(query: string) {
    if (viewMode !== "search" && viewMode !== "recent") {
      setPreviousViewMode(viewMode);
    }
    setViewMode("search");
    setSearchQuery(query);
    if (query.trim().length >= 2) {
      fetchSearchResults(query, "search");
    } else {
      setSearchResults([]);
    }
  }

  function enterRecentMode() {
    if (viewMode !== "search" && viewMode !== "recent") {
      setPreviousViewMode(viewMode);
    }
    setViewMode("recent");
    setSearchQuery("");
    fetchSearchResults("", "recent");
  }

  function exitSearchMode() {
    setViewMode(previousViewMode);
    setSearchQuery("");
    setSearchResults([]);
    setSearchWeeks([]);
  }

  // Summary stats
  const totalPieces = pieces.length;
  const approvedPieces = pieces.filter((p) => p.approval_status === "approved").length;
  const pendingPieces = pieces.filter((p) => p.approval_status === "pending").length;
  const changesRequested = pieces.filter((p) => p.approval_status === "changes_requested").length;

  // Title
  const title =
    viewMode === "month"
      ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
      : (() => {
          const mon = getMonday(currentDate);
          const sun = addDays(mon, 6);
          return `${mon.getDate()} ${MONTH_NAMES[mon.getMonth()].slice(0, 3)} – ${sun.getDate()} ${MONTH_NAMES[sun.getMonth()].slice(0, 3)} ${sun.getFullYear()}`;
        })();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3">
        {/* Row 1: Search bar + Recent button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search posts by title or content..."
              value={searchQuery}
              onChange={(e) => enterSearchMode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-9 text-sm placeholder:text-gray-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            {(viewMode === "search" || viewMode === "recent") && (
              <button
                onClick={exitSearchMode}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={enterRecentMode}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "recent"
                ? "border-violet-300 bg-violet-50 text-violet-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Most Recent
          </button>

          {pendingPieces > 0 && (
            <button
              onClick={() => {
                if (viewMode !== "search" && viewMode !== "recent") {
                  setPreviousViewMode(viewMode);
                }
                setViewMode("search");
                setSearchQuery("");
                fetchSearchResults("", "search", "pending");
              }}
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              {pendingPieces} Pending Approval
            </button>
          )}
        </div>

        {/* Row 2: Calendar navigation + view controls (hidden in search/recent mode) */}
        {viewMode !== "search" && viewMode !== "recent" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Company picker */}
              {showCompanyPicker && (
                <select
                  value={selectedCompany.id}
                  onChange={(e) => {
                    const c = companies.find((co) => co.id === e.target.value);
                    if (c) setSelectedCompany(c);
                  }}
                  aria-label="Select company"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Navigation */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => navigate(-1)}
                  className="px-2.5 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Previous"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={goToToday}
                  className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={() => navigate(1)}
                  className="px-2.5 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Next"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                {timezone && (
                  <p className="text-xs text-gray-500">{timezone}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Show template toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTemplate}
                  onChange={(e) => setShowTemplate(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-xs text-gray-500">Show schedule</span>
              </label>

              {/* View mode toggle */}
              <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
                {(["week", "month"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === mode
                        ? "bg-violet-100 text-violet-700"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {mode === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {totalPieces > 0 && (
        <div className="flex items-center gap-6 rounded-lg border border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{totalPieces}</span>
            <span className="text-xs text-gray-500">posts</span>
          </div>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs text-gray-600">{approvedPieces} approved</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-gray-300" />
            <span className="text-xs text-gray-600">{pendingPieces} pending</span>
          </div>
          {changesRequested > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-xs text-gray-600">{changesRequested} changes</span>
            </div>
          )}
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-400 transition-all"
                style={{ width: `${totalPieces ? (approvedPieces / totalPieces) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Calendar Grid / Search Results */}
      {viewMode === "search" || viewMode === "recent" ? (
        <SearchResultsView
          results={searchResults}
          weeks={searchWeeks}
          loading={searchLoading}
          mode={viewMode}
          query={searchQuery}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
        </div>
      ) : (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {viewMode === "month" ? (
            <MonthView
              grid={getMonthGrid()}
              expandedPieceId={expandedPieceId}
              setExpandedPieceId={setExpandedPieceId}
              expandedDayKey={expandedDayKey}
              setExpandedDayKey={setExpandedDayKey}
            />
          ) : (
            <WeekView
              cells={getWeekGrid()}
              expandedPieceId={expandedPieceId}
              setExpandedPieceId={setExpandedPieceId}
            />
          )}

          {/* Drag overlay */}
          <DragOverlay>
            {activeDragPiece ? (
              <DragOverlayPill piece={activeDragPiece} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <span className="text-xs font-medium text-gray-500">Post types:</span>
        {Object.entries(POST_TYPE_COLORS).slice(0, 8).map(([slug, colors]) => (
          <div key={slug} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: colors.accent, border: `1px solid ${colors.accent}` }} />
            <span className="text-[10px] text-gray-500">{getPostTypeLabel(slug)}</span>
          </div>
        ))}
        {showTemplate && (
          <>
            <div className="h-3 w-px bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded border-2 border-dashed border-gray-300" />
              <span className="text-[10px] text-gray-500">Scheduled (empty)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Drag Overlay Pill ───────────────────────────────────────

function DragOverlayPill({ piece }: { piece: CalendarPiece }) {
  const colors = POST_TYPE_COLORS[piece.post_type || ""] || {
    bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", accent: "#d1d5db",
  };
  const statusBg = STATUS_BG[piece.approval_status] || "bg-gray-100";

  return (
    <div
      className={`rounded px-2 py-1 text-[11px] font-medium shadow-lg ${statusBg}`}
      style={{ borderLeft: `3px solid ${colors.accent}`, width: 160 }}
    >
      <div className="flex items-center gap-1">
        {piece.cover_image_url && (
          <img src={piece.cover_image_url} alt="" className="h-5 w-5 rounded object-cover flex-shrink-0 bg-gray-100" loading="lazy" />
        )}
        <span className="truncate">
          {piece.scheduled_time ? formatTime(piece.scheduled_time) + " " : ""}
          {getPostTypeLabel(piece.post_type)}
        </span>
        <LinkedInIcon className="h-3 w-3 text-[#0A66C2] flex-shrink-0 ml-auto" />
      </div>
    </div>
  );
}

// ── Month View ───────────────────────────────────────────────

function MonthView({
  grid,
  expandedPieceId,
  setExpandedPieceId,
  expandedDayKey,
  setExpandedDayKey,
}: {
  grid: DayCell[][];
  expandedPieceId: string | null;
  setExpandedPieceId: (id: string | null) => void;
  expandedDayKey: string | null;
  setExpandedDayKey: (key: string | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {DAY_NAMES.map((day) => (
          <div key={day} className="px-3 py-2 text-center text-xs font-semibold text-gray-500">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      {grid.map((row, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
          {row.map((cell) => (
            <MonthDayCellView
              key={formatDateKey(cell.date)}
              cell={cell}
              expandedPieceId={expandedPieceId}
              setExpandedPieceId={setExpandedPieceId}
              expandedDayKey={expandedDayKey}
              setExpandedDayKey={setExpandedDayKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Week View ────────────────────────────────────────────────

function WeekView({
  cells,
  expandedPieceId,
  setExpandedPieceId,
}: {
  cells: DayCell[];
  expandedPieceId: string | null;
  setExpandedPieceId: (id: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-3">
      {cells.map((cell) => (
        <WeekDayCellView
          key={formatDateKey(cell.date)}
          cell={cell}
          expandedPieceId={expandedPieceId}
          setExpandedPieceId={setExpandedPieceId}
        />
      ))}
    </div>
  );
}

// ── Month Day Cell ──────────────────────────────────────────

function MonthDayCellView({
  cell,
  expandedPieceId,
  setExpandedPieceId,
  expandedDayKey,
  setExpandedDayKey,
}: {
  cell: DayCell;
  expandedPieceId: string | null;
  setExpandedPieceId: (id: string | null) => void;
  expandedDayKey: string | null;
  setExpandedDayKey: (key: string | null) => void;
}) {
  const router = useRouter();
  const { date, isCurrentMonth, isToday, pieces, templateSlots, week } = cell;
  const dateKey = formatDateKey(date);
  const gridDay = jsToGridDay(date.getDay());
  const dayName = GRID_TO_DAY_NAME[gridDay];

  return (
    <DroppableDay dateKey={dateKey} date={date}>
      <div
        className={`min-h-[100px] border-r border-gray-100 last:border-r-0 p-1.5 transition-colors ${
          isCurrentMonth ? "bg-white" : "bg-gray-50/50"
        } ${isToday ? "ring-2 ring-inset ring-violet-300" : ""}`}
      >
        <div className="flex items-center justify-between mb-1">
          <span
            className={`text-xs font-medium ${
              isToday
                ? "flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white"
                : isCurrentMonth
                ? "text-gray-900"
                : "text-gray-500"
            }`}
          >
            {date.getDate()}
          </span>
          {week && (
            <Link href={`/review/${week.id}`} className="text-[9px] text-gray-500 hover:text-violet-600">
              {formatWeekLabelShort(week.date_start, week.week_number)}
            </Link>
          )}
        </div>

        <div className="space-y-0.5">
          {/* Actual content pieces */}
          {pieces.slice(0, 3).map((piece) => {
            const colors = POST_TYPE_COLORS[piece.post_type || ""] || {
              bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", accent: "#d1d5db",
            };
            const statusBg = STATUS_BG[piece.approval_status] || "bg-gray-100";
            return (
              <div key={piece.id} className="relative">
                <DraggablePill piece={piece}>
                  <button
                    onClick={() => setExpandedPieceId(expandedPieceId === piece.id ? null : piece.id)}
                    className={`w-full text-left block rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight truncate ${statusBg} hover:opacity-80 transition-opacity`}
                    style={{ borderLeft: `3px solid ${colors.accent}` }}
                    title={piece.title}
                  >
                    <div className="flex items-center gap-1">
                      {piece.cover_image_url && (
                        <img
                          src={piece.cover_image_url}
                          alt=""
                          className="h-5 w-5 rounded object-cover flex-shrink-0 bg-gray-100"
                          loading="lazy"
                        />
                      )}
                      <span className="truncate">
                        {piece.scheduled_time ? formatTime(piece.scheduled_time) + " " : ""}
                        {getPostTypeLabel(piece.post_type)}
                      </span>
                      <LinkedInIcon className="h-2.5 w-2.5 text-[#0A66C2] flex-shrink-0 ml-auto" />
                    </div>
                  </button>
                </DraggablePill>
                {expandedPieceId === piece.id && (
                  <PiecePopover piece={piece} onClose={() => setExpandedPieceId(null)} anchorRef={null} />
                )}
              </div>
            );
          })}

          {/* "+N more" with expand on click */}
          {pieces.length > 3 && (
            <div className="relative">
              <button
                onClick={() => setExpandedDayKey(expandedDayKey === dateKey ? null : dateKey)}
                className="text-[9px] text-violet-500 font-medium px-1 hover:text-violet-700 cursor-pointer"
              >
                +{pieces.length - 3} more
              </button>
              {expandedDayKey === dateKey && (
                <MorePiecesPopover
                  pieces={pieces.slice(3)}
                  expandedPieceId={expandedPieceId}
                  setExpandedPieceId={setExpandedPieceId}
                  onClose={() => setExpandedDayKey(null)}
                />
              )}
            </div>
          )}

          {/* Ghost template slots (unfilled) - clickable for quick-create */}
          {templateSlots.slice(0, 2).map((slot) => (
            <button
              key={slot.id}
              onClick={() => {
                const slug = slot.post_types?.slug || "";
                router.push(`/generate/quick?postType=${slug}&day=${dayName}`);
              }}
              className="w-full text-left rounded border border-dashed border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors group"
            >
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full border border-gray-300 flex-shrink-0 group-hover:border-violet-400" />
                <span className="truncate">
                  {formatTime(slot.scheduled_time)}{" "}
                  {slot.post_types?.label || slot.slot_label || "Post"}
                </span>
                <svg className="h-3 w-3 text-gray-300 flex-shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </DroppableDay>
  );
}

// ── Week Day Cell ───────────────────────────────────────────

function WeekDayCellView({
  cell,
  expandedPieceId,
  setExpandedPieceId,
}: {
  cell: DayCell;
  expandedPieceId: string | null;
  setExpandedPieceId: (id: string | null) => void;
}) {
  const router = useRouter();
  const { date, isCurrentMonth, isToday, pieces, templateSlots, week } = cell;
  const dateKey = formatDateKey(date);
  const gridDay = jsToGridDay(date.getDay());
  const dayName = GRID_TO_DAY_NAME[gridDay];

  return (
    <DroppableDay dateKey={dateKey} date={date}>
      <div
        className={`rounded-xl border bg-white min-h-[200px] ${
          isToday ? "border-violet-300 ring-2 ring-violet-100" : "border-gray-200"
        }`}
      >
        {/* Day header */}
        <div className={`border-b px-3 py-2 ${isToday ? "border-violet-200 bg-violet-50" : "border-gray-100 bg-gray-50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${isToday ? "text-violet-700" : "text-gray-900"}`}>
                {DAY_NAMES[gridDay]}
              </span>
              <span className={`text-xs ${isToday ? "text-violet-500" : "text-gray-500"}`}>
                {date.getDate()} {MONTH_NAMES[date.getMonth()].slice(0, 3)}
              </span>
            </div>
            {week && (
              <Link
                href={`/review/${week.id}`}
                className="text-[10px] text-gray-500 hover:text-violet-600"
              >
                {formatWeekLabelShort(week.date_start, week.week_number)}
              </Link>
            )}
          </div>
        </div>

        {/* Content cards */}
        <div className="space-y-2 p-2">
          {pieces.length === 0 && templateSlots.length === 0 && (
            <p className="py-4 text-center text-xs text-gray-500">No content</p>
          )}

          {/* Actual pieces */}
          {pieces.map((piece) => {
            const colors = POST_TYPE_COLORS[piece.post_type || ""] || {
              bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", accent: "#d1d5db",
            };
            const statusBg = STATUS_BG[piece.approval_status] || "bg-gray-100";
            return (
              <div key={piece.id} className="relative">
                <DraggablePill piece={piece}>
                  <button
                    onClick={() => setExpandedPieceId(expandedPieceId === piece.id ? null : piece.id)}
                    className={`w-full text-left block rounded-lg p-2.5 transition-all hover:shadow-sm ${statusBg}`}
                    style={{ borderLeft: `3px solid ${colors.accent}` }}
                    title={piece.title}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-2">
                        {piece.cover_image_url && (
                          <img
                            src={piece.cover_image_url}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                            loading="lazy"
                          />
                        )}
                        <span className={`text-xs font-semibold ${colors.text}`}>
                          {getPostTypeLabel(piece.post_type)}
                        </span>
                      </div>
                      <LinkedInIcon className="h-3 w-3 text-[#0A66C2] flex-shrink-0 mt-0.5" />
                    </div>
                    {piece.scheduled_time && (
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {formatTime(piece.scheduled_time)}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-gray-600 line-clamp-2 leading-tight">
                      {piece.title}
                    </p>
                  </button>
                </DraggablePill>
                {expandedPieceId === piece.id && (
                  <PiecePopover piece={piece} onClose={() => setExpandedPieceId(null)} anchorRef={null} />
                )}
              </div>
            );
          })}

          {/* Ghost template slots - clickable for quick-create */}
          {templateSlots.map((slot) => (
            <button
              key={slot.id}
              onClick={() => {
                const slug = slot.post_types?.slug || "";
                router.push(`/generate/quick?postType=${slug}&day=${dayName}`);
              }}
              className="w-full text-left rounded-lg border-2 border-dashed border-gray-200 p-2.5 transition-colors hover:border-violet-400 hover:bg-violet-50 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs font-medium text-gray-500">
                  {slot.post_types?.label || slot.slot_label || "Scheduled Post"}
                </span>
                <svg className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="mt-0.5 text-[10px] text-gray-500">
                {formatTime(slot.scheduled_time)}
                {slot.image_archetype ? ` · ${slot.image_archetype.replace(/_/g, " ")}` : ""}
              </p>
              <p className="mt-1 text-[10px] text-gray-500 italic">Not yet generated</p>
            </button>
          ))}
        </div>
      </div>
    </DroppableDay>
  );
}

// ── Search / Recent Results View ──────────────────────────────

function SearchResultsView({
  results,
  weeks,
  loading,
  mode,
  query,
}: {
  results: CalendarPiece[];
  weeks: CalendarWeek[];
  loading: boolean;
  mode: "search" | "recent";
  query: string;
}) {
  const weekMap = new Map(weeks.map((w) => [w.id, w]));

  const STATUS_LABELS: Record<string, { label: string; dotColor: string }> = {
    pending: { label: "Pending", dotColor: "bg-gray-300" },
    approved: { label: "Approved", dotColor: "bg-green-400" },
    changes_requested: { label: "Changes Requested", dotColor: "bg-amber-400" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
      </div>
    );
  }

  if (mode === "search" && query.length < 2) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">Type at least 2 characters to search</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">
          {mode === "search" ? `No posts found for "${query}"` : "No recent posts found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-gray-700">
          {mode === "recent" ? "Most Recent Posts" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
        </h3>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {results.map((piece) => {
          const colors = POST_TYPE_COLORS[piece.post_type || ""] || {
            bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", accent: "#d1d5db",
          };
          const week = weekMap.get(piece.week_id);
          const status = STATUS_LABELS[piece.approval_status] || STATUS_LABELS.pending;

          return (
            <Link
              key={piece.id}
              href={`/content/${piece.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              {/* Status dot */}
              <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${status.dotColor}`} />

              {/* Thumbnail */}
              {piece.cover_image_url && (
                <img
                  src={piece.cover_image_url}
                  alt=""
                  className="h-8 w-8 rounded object-cover flex-shrink-0 bg-gray-100"
                  loading="lazy"
                />
              )}

              {/* Post type badge */}
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border ${colors.bg} ${colors.text} ${colors.border} flex-shrink-0`}>
                {getPostTypeLabel(piece.post_type)}
              </span>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{piece.title || "Untitled post"}</p>
                {piece.markdown_body && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {piece.markdown_body.slice(0, 120).replace(/[#*_\n]/g, " ").trim()}
                  </p>
                )}
              </div>

              {/* Week info */}
              {week && (
                <span className="text-[11px] text-gray-500 flex-shrink-0">
                  {formatWeekLabelShort(week.date_start, week.week_number)}
                </span>
              )}

              {/* Status label */}
              <span className={`text-[11px] font-medium flex-shrink-0 ${
                piece.approval_status === "approved" ? "text-green-600" :
                piece.approval_status === "changes_requested" ? "text-amber-600" :
                "text-gray-500"
              }`}>
                {status.label}
              </span>

              {/* LinkedIn icon */}
              <LinkedInIcon className="h-3.5 w-3.5 text-[#0A66C2] flex-shrink-0" />

              {/* Arrow */}
              <svg className="h-4 w-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
