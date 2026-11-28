import { postDateFor } from "@/lib/export/post-date";
import { isLinkedInDirectType, linkedInPlatformForPostType } from "@/lib/linkedin/direct-publish";

/**
 * Deploy week (13 Nov 2026): what one confirmed click does with a fully
 * approved week, decided once for the deploy page and the deploy route.
 *
 * Approved feed posts the direct LinkedIn queue takes (the same types its
 * route accepts) with a future posting time go to that queue at that time.
 * Everything else stays manual and is listed: the blog (a pull request on
 * the website, merged by hand), feed posts that cannot be queued (each says
 * whether the scheduler export carries it or it is posted by hand), and the
 * newsletter article (pasted into LinkedIn from its copy page). Times are
 * UK wall clock, as the planner and the scheduler export show them.
 */

export interface DeployPiece {
  id: string;
  title: string | null;
  content_type: string;
  approval_status: string;
  day_of_week: string | null;
  scheduled_time: string | null;
  scheduled_date?: string | null;
  /** Decides the feed: company page pieces take the page slots, every other piece the profile slot. */
  post_type?: string | null;
}

export const DEPLOY_SOCIAL_TYPES = ["social_post", "video", "video_script", "meme"] as const;

/** The feed types the scheduler export carries (src/app/api/export/metricool/route.ts). */
export const SCHEDULER_EXPORT_TYPES = ["social_post", "meme"] as const;

export function inSchedulerExport(contentType: string): boolean {
  return (SCHEDULER_EXPORT_TYPES as readonly string[]).includes(contentType);
}

/**
 * Where a feed post that was not queued goes next: the scheduler export
 * (only for types it carries), by hand, or back for approval.
 */
export type NotQueuedNext = "export" | "by_hand" | "approve";

export function nextForType(contentType: string): Exclude<NotQueuedNext, "approve"> {
  return inSchedulerExport(contentType) ? "export" : "by_hand";
}

const ZONE = "Europe/London";

function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A UK wall-clock date and time as a UTC ISO string, or null when either is malformed. */
export function londonWallClockToUtc(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!d || !t) return null;
  const [h, m, s] = [Number(t[1]), Number(t[2]), Number(t[3] || 0)];
  if (h > 23 || m > 59 || s > 59) return null;
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), h, m, s);
  if (!Number.isFinite(guess)) return null;
  let utc = guess - londonOffsetMinutes(new Date(guess)) * 60000;
  const second = londonOffsetMinutes(new Date(utc));
  utc = guess - second * 60000;
  return new Date(utc).toISOString();
}

/** When the piece posts, in UTC, or null when it has no day or no time. Never guessed. */
export function scheduledForPiece(piece: DeployPiece, weekStart: string): string | null {
  const hasDay = !!piece.scheduled_date || (piece.day_of_week !== null && piece.day_of_week !== undefined && String(piece.day_of_week).trim() !== "");
  if (!hasDay || !piece.scheduled_time) return null;
  return londonWallClockToUtc(postDateFor(piece, weekStart), piece.scheduled_time);
}

/**
 * Default posting slots (UK wall clock), used only when a piece has a day
 * but no time of its own: the profile posts Monday to Saturday at 10:30, the
 * AGENCY page at 09:00 and 12:00 (the day's first and second page post).
 * A piece's own time always wins. Nothing is guessed beyond these.
 */
export const PROFILE_DEFAULT_SLOT = "10:30";
export const PAGE_DEFAULT_SLOTS = ["09:00", "12:00"] as const;

/** 0 = Sunday, from a YYYY-MM-DD date. */
function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Fills a missing scheduled_time from the default slots; pieces keep their own time. */
export function withDefaultSlots(pieces: DeployPiece[], weekStart: string): DeployPiece[] {
  const pageCountByDay = new Map<string, number>();
  return pieces.map((p) => {
    if (p.scheduled_time) return p;
    const hasDay = !!p.scheduled_date || (p.day_of_week !== null && p.day_of_week !== undefined && String(p.day_of_week).trim() !== "");
    if (!hasDay) return p;
    const date = postDateFor(p, weekStart);
    if (linkedInPlatformForPostType(p.post_type) === "linkedin_company") {
      const n = pageCountByDay.get(date) ?? 0;
      pageCountByDay.set(date, n + 1);
      return n < PAGE_DEFAULT_SLOTS.length ? { ...p, scheduled_time: PAGE_DEFAULT_SLOTS[n] } : p;
    }
    return weekdayOf(date) === 0 ? p : { ...p, scheduled_time: PROFILE_DEFAULT_SLOT };
  });
}

/** The calendar date (YYYY-MM-DD, UK) a piece posts on, or null with no day. */
export function pieceDay(piece: DeployPiece, weekStart: string): string | null {
  const hasDay = !!piece.scheduled_date || (piece.day_of_week !== null && piece.day_of_week !== undefined && String(piece.day_of_week).trim() !== "");
  return hasDay ? postDateFor(piece, weekStart) : null;
}

export interface DeploySocial { pieceId: string; title: string; contentType: string; scheduledFor: string }
export interface DeployManualSocial { pieceId: string; title: string; contentType: string; reason: string; next: NotQueuedNext }

const NOT_DIRECT_REASON: Record<string, string> = {
  meme: "Direct LinkedIn publishing does not take memes.",
  video_script: "It is a video script, not a finished video.",
};

export interface WeekDeployPlan {
  /** Every piece is approved and there is at least one. */
  ready: boolean;
  unapproved: number;
  /** Pieces that are not approved: listed, never planned. */
  unapprovedPieces: Array<{ pieceId: string; title: string; contentType: string }>;
  /** Approved feed posts left out because their day was not ticked. */
  unselected: Array<{ pieceId: string; title: string; contentType: string }>;
  social: DeploySocial[];
  manualSocial: DeployManualSocial[];
  blogs: Array<{ id: string; title: string }>;
  newsletters: Array<{ id: string; title: string }>;
}

/**
 * Only approved pieces are ever offered; an unapproved one is listed as
 * refused, never planned, and does not hold back the approved ones. `days`
 * (YYYY-MM-DD) limits the feed posts to the ticked days; omit it for all.
 */
export function planWeekDeploy(pieces: DeployPiece[], weekStart: string, now: Date = new Date(), options: { days?: string[] } = {}): WeekDeployPlan {
  const approved = withDefaultSlots(pieces.filter((p) => p.approval_status === "approved"), weekStart);
  const plan: WeekDeployPlan = {
    ready: approved.length > 0,
    unapproved: pieces.length - approved.length,
    unapprovedPieces: pieces.filter((p) => p.approval_status !== "approved")
      .map((p) => ({ pieceId: p.id, title: p.title?.trim() || "Untitled", contentType: p.content_type })),
    unselected: [],
    social: [], manualSocial: [], blogs: [], newsletters: [],
  };
  const days = options.days ? new Set(options.days) : null;
  for (const p of approved) {
    const title = p.title?.trim() || "Untitled";
    if ((DEPLOY_SOCIAL_TYPES as readonly string[]).includes(p.content_type)) {
      const contentType = p.content_type;
      const day = pieceDay(p, weekStart);
      if (days && (!day || !days.has(day))) { plan.unselected.push({ pieceId: p.id, title, contentType }); continue; }
      const manual = (reason: string) => plan.manualSocial.push({ pieceId: p.id, title, contentType, reason, next: nextForType(contentType) });
      if (!isLinkedInDirectType(contentType)) { manual(NOT_DIRECT_REASON[contentType] || "Direct LinkedIn publishing does not take this kind of post."); continue; }
      const at = scheduledForPiece(p, weekStart);
      if (!at) manual("It has no posting day or time.");
      else if (Date.parse(at) <= now.getTime() + 60_000) manual("Its posting time has passed.");
      else plan.social.push({ pieceId: p.id, title, contentType, scheduledFor: at });
    } else if (p.content_type === "blog_article") {
      plan.blogs.push({ id: p.id, title });
    } else if (p.content_type === "linkedin_article") {
      plan.newsletters.push({ id: p.id, title });
    }
  }
  return plan;
}
