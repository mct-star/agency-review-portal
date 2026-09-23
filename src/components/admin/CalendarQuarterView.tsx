import type { CalendarSlotRow, WeekGroup } from "@/lib/calendar-slots/data";
import SinglePostButton from "@/components/admin/SinglePostButton";
import {
  SOURCE_OWNER_META,
  PHOTO_TIER_META,
  TIER_UNSET_META,
  PHOTO_NEEDED_META,
  ANCHOR_PENDING_META,
  dayShortLabel,
  slotTypeLabel,
} from "@/lib/constants/calendar-slots";

interface CalendarQuarterViewProps {
  weeks: WeekGroup[];
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const startLabel = startDate.toLocaleDateString("en-GB", opts);
  const endLabel = endDate.toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return `${startLabel} to ${endLabel}`;
}

function themeLine(group: WeekGroup): string | null {
  if (group.week?.arc_movement) return group.week.arc_movement;
  const themes = Array.from(
    new Set(group.slots.map((s) => s.theme).filter((t): t is string => Boolean(t)))
  );
  if (themes.length === 0) return null;
  if (themes.length === 1) return themes[0];
  return `Mixed: ${themes.join(", ")}`;
}

export default function CalendarQuarterView({ weeks }: CalendarQuarterViewProps) {
  const totalSlots = weeks.reduce((sum, w) => sum + w.slots.length, 0);
  const photoNeededTotal = weeks.reduce(
    (sum, w) => sum + w.slots.filter((s) => s.photo_needed).length,
    0
  );
  const anchorPendingTotal = weeks.reduce(
    (sum, w) => sum + w.slots.filter((s) => s.anchor_pending).length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Source Calendar</h1>
        <p className="mt-1 text-sm text-gray-500">
          The calendar_slots source contract, grouped by ISO week. Read-only.
        </p>
      </div>

      {weeks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No calendar slots found.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{weeks.length} week{weeks.length === 1 ? "" : "s"}</span>
            <span>{totalSlots} slot{totalSlots === 1 ? "" : "s"}</span>
            <span>{photoNeededTotal} need{photoNeededTotal === 1 ? "s" : ""} a photo</span>
            <span>
              {anchorPendingTotal} anchor{anchorPendingTotal === 1 ? "" : "s"} pending
            </span>
          </div>

          <div className="space-y-4">
            {weeks.map((group) => (
              <WeekCard
                key={`${group.companyId}-${group.weekNumber}-${group.year}`}
                group={group}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WeekCard({ group }: { group: WeekGroup }) {
  const tierMeta = group.week?.photo_tier
    ? PHOTO_TIER_META[group.week.photo_tier]
    : TIER_UNSET_META;
  const line = themeLine(group);
  const photoNeededCount = group.slots.filter((s) => s.photo_needed).length;
  const anchorPendingCount = group.slots.filter((s) => s.anchor_pending).length;
  const orderedSlots = [...group.slots].sort((a, b) => a.slot_date.localeCompare(b.slot_date));

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wide text-gray-400"
            title={
              group.sourceWeekLabel
                ? `Source file label: ${group.sourceWeekLabel}`
                : undefined
            }
          >
            {group.companyName} &middot; Week {group.weekNumber}, {group.year}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {formatDateRange(group.weekStartDate, group.weekEndDate)}
          </p>
          <p className={`mt-0.5 text-xs ${line ? "text-gray-500" : "italic text-gray-400"}`}>
            {line || "No theme set"}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierMeta.badgeClass}`}
        >
          {tierMeta.label}
        </span>
      </div>

      {(photoNeededCount > 0 || anchorPendingCount > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
          {photoNeededCount > 0 && (
            <span>
              {photoNeededCount} need{photoNeededCount === 1 ? "s" : ""} a photo
            </span>
          )}
          {anchorPendingCount > 0 && (
            <span>
              {anchorPendingCount} anchor{anchorPendingCount === 1 ? "" : "s"} pending
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {orderedSlots.map((slot) => (
          <SlotChip key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  );
}

function SlotChip({ slot }: { slot: CalendarSlotRow }) {
  const ownerMeta = SOURCE_OWNER_META[slot.source_owner];

  return (
    <div className="flex w-full flex-col gap-1 rounded-md border border-gray-200 bg-gray-50 p-2.5 text-xs sm:w-[220px]">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-400">
        <span>{dayShortLabel(slot.day_of_week)}</span>
        <span>{slotTypeLabel(slot.slot_type)}</span>
      </div>
      <p className="font-medium text-gray-900">{slot.topic}</p>
      <p className="text-gray-500">
        {slot.pillar}
        {slot.post_type_slug ? ` · ${slot.post_type_slug}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-1 pt-0.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ownerMeta.badgeClass}`}
        >
          {ownerMeta.label}
        </span>
        {slot.photo_needed && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PHOTO_NEEDED_META.badgeClass}`}
          >
            {PHOTO_NEEDED_META.label}
          </span>
        )}
        {slot.anchor_pending && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ANCHOR_PENDING_META.badgeClass}`}
          >
            {ANCHOR_PENDING_META.label}
          </span>
        )}
      </div>
      {(slot.day_of_week !== "sunday" || slot.slot_type === "video" || slot.slot_type === "meme") && (
        <SinglePostButton slotId={slot.id} compact kind={slot.slot_type === "video" ? "video" : slot.post_type_slug === "mini_infographic" ? "infographic" : slot.slot_type === "meme" ? "meme" : "post"} />
      )}
    </div>
  );
}
