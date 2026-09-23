import type {
  CalendarSlotSourceOwner,
  CalendarSlotStatus,
  WeekPhotoTier,
} from "@/types/database";

interface BadgeMeta {
  label: string;
  badgeClass: string;
}

/**
 * One visually distinct badge per source owner, so a week's slot
 * list reads at a glance without having to read every label. See
 * migration 032: calendar_slots.source_owner is not null by
 * constraint, so every slot always has one of these.
 */
export const SOURCE_OWNER_META: Record<CalendarSlotSourceOwner, BadgeMeta> = {
  voice_note: { label: "Voice note", badgeClass: "bg-violet-50 text-violet-700" },
  booksy: { label: "Booksy", badgeClass: "bg-blue-50 text-blue-700" },
  stratty_canon: { label: "Stratty canon", badgeClass: "bg-indigo-50 text-indigo-700" },
  ppcy: { label: "PPCy", badgeClass: "bg-emerald-50 text-emerald-700" },
  amy: { label: "Amy", badgeClass: "bg-pink-50 text-pink-700" },
  industry_radar: { label: "Industry radar", badgeClass: "bg-cyan-50 text-cyan-700" },
};

/** Photo supply tier. a = 3+ new photos, b = 1 to 2, c = zero. */
export const PHOTO_TIER_META: Record<WeekPhotoTier, BadgeMeta> = {
  a: { label: "Tier A", badgeClass: "bg-emerald-50 text-emerald-700" },
  b: { label: "Tier B", badgeClass: "bg-amber-50 text-amber-800" },
  c: { label: "Tier C", badgeClass: "bg-red-50 text-red-700" },
};

/** Shown when a slot's week has no weeks row yet, so no tier has been set. */
export const TIER_UNSET_META: BadgeMeta = {
  label: "Tier unset",
  badgeClass: "bg-gray-100 text-gray-500",
};

export const SLOT_STATUS_META: Record<CalendarSlotStatus, BadgeMeta> = {
  planned: { label: "Planned", badgeClass: "bg-gray-100 text-gray-600" },
  briefed: { label: "Briefed", badgeClass: "bg-blue-50 text-blue-700" },
  written: { label: "Written", badgeClass: "bg-violet-50 text-violet-700" },
  shipped: { label: "Shipped", badgeClass: "bg-emerald-50 text-emerald-700" },
  dropped: { label: "Dropped", badgeClass: "bg-red-50 text-red-700" },
};

export const PHOTO_NEEDED_META: BadgeMeta = {
  label: "Photo needed",
  badgeClass: "bg-amber-50 text-amber-800",
};

/** Reactive slot held open for a live signal: no anchor yet, by design. */
export const ANCHOR_PENDING_META: BadgeMeta = {
  label: "Anchor pending",
  badgeClass: "bg-red-50 text-red-700",
};

const DAY_SHORT_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function dayShortLabel(day: string): string {
  return DAY_SHORT_LABELS[day] || day;
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  thesis: "Thesis",
  doc: "Doc",
  carousel: "Carousel",
  reactive: "Reactive",
  video: "Video",
  meme: "Meme",
};

/** slot_type is the production class (see migration 032 comments), not the topic. */
export function slotTypeLabel(slotType: string): string {
  return SLOT_TYPE_LABELS[slotType] || slotType;
}
