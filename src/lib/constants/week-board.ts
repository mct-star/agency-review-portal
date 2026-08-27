import type { WeekPhotoTier, WeekRunState } from "@/types/database";

/**
 * Week Board feature flag. Admin-only internal module, off by
 * default in any environment where the var is not explicitly set
 * to "true". Safe to import from both server and client code
 * since it only reads a NEXT_PUBLIC_ var (inlined at build time).
 */
export const WEEK_BOARD_FEATURE_FLAG = "NEXT_PUBLIC_WEEK_BOARD_ENABLED";

export function isWeekBoardEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WEEK_BOARD_ENABLED === "true";
}

/** How often the board polls for updates while a job is active. */
export const WEEK_BOARD_POLL_INTERVAL_MS = 4000;

interface RunStateMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
}

export const RUN_STATE_META: Record<WeekRunState, RunStateMeta> = {
  idle: {
    label: "Idle",
    badgeClass: "bg-gray-100 text-gray-600",
    dotClass: "bg-gray-400",
  },
  queued: {
    label: "Queued",
    badgeClass: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  running: {
    label: "Running",
    badgeClass: "bg-amber-50 text-amber-800",
    dotClass: "bg-amber-500 animate-pulse",
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
  },
  complete: {
    label: "Complete",
    badgeClass: "bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
};

/** Run states where a job is actively occupying the single-flight slot. */
export const ACTIVE_RUN_STATES: WeekRunState[] = ["queued", "running"];

interface PhotoTierMeta {
  label: string;
  badgeClass: string;
}

/**
 * a = 3+ new photos, b = 1 to 2, c = zero, per the definition on
 * weeks.photo_tier (migration 032). Colour runs green to red with
 * supply, not with anything about the week's content quality.
 */
export const PHOTO_TIER_META: Record<WeekPhotoTier, PhotoTierMeta> = {
  a: { label: "Tier A", badgeClass: "bg-emerald-50 text-emerald-700" },
  b: { label: "Tier B", badgeClass: "bg-amber-50 text-amber-800" },
  c: { label: "Tier C", badgeClass: "bg-red-50 text-red-700" },
};

/** Badge class for a week whose tier has not been set at planning time. */
export const PHOTO_TIER_UNSET_BADGE_CLASS = "bg-gray-100 text-gray-400";
