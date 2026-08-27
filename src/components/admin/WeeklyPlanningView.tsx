import type { CalendarSlotRow, WeekGroup } from "@/lib/calendar-slots/data";
import {
  SOURCE_OWNER_META,
  SLOT_STATUS_META,
  PHOTO_TIER_META,
  TIER_UNSET_META,
  PHOTO_NEEDED_META,
  dayShortLabel,
} from "@/lib/constants/calendar-slots";

interface IsoWeekTarget {
  week: number;
  year: number;
}

interface WeeklyPlanningViewProps {
  currentWeekTarget: IsoWeekTarget;
  nextWeekTarget: IsoWeekTarget;
  /** Only the groups matching currentWeekTarget or nextWeekTarget. */
  weeks: WeekGroup[];
  /** Set only when weeks is empty: the nearest planned week, for a useful pointer. */
  nearestUpcoming: WeekGroup | null;
}

// Tuesday, Friday and Saturday are voice_note-owned by design and
// have no fallback owner, see the content calendar planning rules.
const VOICE_NOTE_DAYS = ["tuesday", "friday", "saturday"] as const;

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const startLabel = startDate.toLocaleDateString("en-GB", opts);
  const endLabel = endDate.toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return `${startLabel} to ${endLabel}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function isSameWeek(group: WeekGroup, target: IsoWeekTarget): boolean {
  return group.weekNumber === target.week && group.year === target.year;
}

type VoiceNoteCheckState = "ok" | "missing" | "mismatch";

function voiceNoteDayCheck(
  group: WeekGroup,
  day: string
): { state: VoiceNoteCheckState; owners: string[] } {
  const daySlots = group.slots.filter((s) => s.day_of_week === day);
  if (daySlots.length === 0) return { state: "missing", owners: [] };
  const owners = Array.from(new Set(daySlots.map((s) => s.source_owner)));
  if (owners.length === 1 && owners[0] === "voice_note") return { state: "ok", owners };
  return { state: "mismatch", owners };
}

export default function WeeklyPlanningView({
  currentWeekTarget,
  nextWeekTarget,
  weeks,
  nearestUpcoming,
}: WeeklyPlanningViewProps) {
  const currentGroups = weeks.filter((g) => isSameWeek(g, currentWeekTarget));
  const nextGroups = weeks.filter((g) => isSameWeek(g, nextWeekTarget));
  const nothingPlanned = currentGroups.length === 0 && nextGroups.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Slot Planner</h1>
        <p className="mt-1 text-sm text-gray-500">
          This week and next, from the calendar_slots source contract. Read-only.
        </p>
      </div>

      {nothingPlanned && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
          <p>
            No planned slots for ISO week {currentWeekTarget.week}/{currentWeekTarget.year}{" "}
            or {nextWeekTarget.week}/{nextWeekTarget.year} yet.
          </p>
          {nearestUpcoming ? (
            <p className="mt-2">
              The earliest planned week is{" "}
              <span className="font-medium text-gray-700">
                Week {nearestUpcoming.weekNumber}, {nearestUpcoming.year}
              </span>{" "}
              ({formatDateRange(nearestUpcoming.weekStartDate, nearestUpcoming.weekEndDate)}).
              See it on the{" "}
              <a href="/admin/calendar" className="text-violet-600 hover:underline">
                Source Calendar
              </a>
              .
            </p>
          ) : (
            <p className="mt-2">No calendar slots have been seeded yet.</p>
          )}
        </div>
      )}

      {!nothingPlanned && (
        <>
          <WeekSection label="This week" target={currentWeekTarget} groups={currentGroups} />
          <WeekSection label="Next week" target={nextWeekTarget} groups={nextGroups} />
        </>
      )}
    </div>
  );
}

function WeekSection({
  label,
  target,
  groups,
}: {
  label: string;
  target: IsoWeekTarget;
  groups: WeekGroup[];
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">
        {label}{" "}
        <span className="font-normal text-gray-400">
          &middot; ISO week {target.week}, {target.year}
        </span>
      </h2>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-400">
          No planned slots for this week yet.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <PlanningWeekCard
              key={`${group.companyId}-${group.weekNumber}-${group.year}`}
              group={group}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanningWeekCard({ group }: { group: WeekGroup }) {
  const tierMeta = group.week?.photo_tier
    ? PHOTO_TIER_META[group.week.photo_tier]
    : TIER_UNSET_META;
  const photoNeededCount = group.slots.filter((s) => s.photo_needed).length;
  const orderedSlots = [...group.slots].sort((a, b) => a.slot_date.localeCompare(b.slot_date));

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {group.companyName} &middot; Week {group.weekNumber}, {group.year} &middot;{" "}
          {formatDateRange(group.weekStartDate, group.weekEndDate)}
        </p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierMeta.badgeClass}`}
        >
          {tierMeta.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>
          {photoNeededCount} slot{photoNeededCount === 1 ? "" : "s"} need
          {photoNeededCount === 1 ? "s" : ""} a photo
        </span>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Voice-note days:</span>
          {VOICE_NOTE_DAYS.map((day) => {
            const check = voiceNoteDayCheck(group, day);
            const dotClass =
              check.state === "ok"
                ? "bg-emerald-500"
                : check.state === "missing"
                ? "bg-gray-300"
                : "bg-amber-500";
            const title =
              check.state === "ok"
                ? "voice_note as expected"
                : check.state === "missing"
                ? "No slot planned for this day"
                : `Expected voice_note, found ${check.owners.join(", ")}`;
            return (
              <span key={day} className="inline-flex items-center gap-1" title={title}>
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                {dayShortLabel(day)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {orderedSlots.map((slot) => (
          <PlanningSlotRow key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  );
}

function PlanningSlotRow({ slot }: { slot: CalendarSlotRow }) {
  const statusMeta = SLOT_STATUS_META[slot.status];
  const ownerMeta = SOURCE_OWNER_META[slot.source_owner];
  const anchorText = slot.anchor_pending
    ? "Anchor pending (reactive slot, held for a live signal)"
    : slot.source_anchor
    ? truncate(slot.source_anchor, 110)
    : "No anchor recorded";

  return (
    <div className="flex flex-col gap-1.5 py-2.5 text-xs first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-gray-900">
          {dayShortLabel(slot.day_of_week)} &middot; {slot.topic}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ownerMeta.badgeClass}`}
          >
            {ownerMeta.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}
          >
            {statusMeta.label}
          </span>
          {slot.photo_needed && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PHOTO_NEEDED_META.badgeClass}`}
            >
              {PHOTO_NEEDED_META.label}
            </span>
          )}
        </div>
      </div>
      <p className={slot.anchor_pending ? "italic text-amber-700" : "text-gray-500"}>
        {anchorText}
      </p>
      <p className="italic text-gray-400">no brief yet</p>
    </div>
  );
}
