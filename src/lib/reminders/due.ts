/**
 * Which review reminders are due right now, for one company.
 *
 * Pure: no database, no network, no clock. The caller loads the company's
 * cadence, timezone, posting slots, weeks, pieces, capture items and
 * reminder_log rows, passes the current time, and gets back the reminders to
 * send. The caller then inserts each into reminder_log (ON CONFLICT DO
 * NOTHING) and sends only the ones whose insert returned a row.
 *
 * Every reminder has a first send and at most one follow-up. A follow-up is
 * only due when the first send is in the log, went out before the follow-up
 * time, and went out at least FOLLOW_UP_MIN_GAP_HOURS ago (two hours for
 * todays_post). So a first send at 08:00 is never chased at 09:00, and a first
 * send after the follow-up time is never chased at all. The first send and the
 * follow-up are never returned in the same run.
 *
 * Every window has an end, so nothing from a past week or article is reminded:
 *   week_ready, deploy_week  weekly_batch companies only; both close at the
 *                            week's first post, and a week with no dated piece
 *                            gets neither. deploy_week needs the week itself to
 *                            be "approved" as well as every piece approved.
 *                            Both send only in the daytime window, from the
 *                            reminder hour until WEEK_REMINDERS_UNTIL_HOUR
 *                            (local), so a week made ready late at night is
 *                            reminded the next morning, not at 23:00.
 *   todays_post              daily and posting_days companies; the piece's
 *                            week must be ready_for_review or approved. Opens
 *                            at the reminder hour or two hours before the slot,
 *                            whichever is earlier, and closes at the slot.
 *   manual_publish           closes at the end of the day after it is due.
 *   capture_due              closes once every capture on the date is marked
 *                            captured (optional `captured` flag; absent means
 *                            not captured, the old behaviour).
 *
 * All wall-clock times (reminder hour, slot times, dates) are in the
 * company's timezone, so a reminder at 08:00 stays at 08:00 local across a
 * daylight saving change.
 */
import type { ApprovalStatus, CompanyCadence, PostingSlot, ReminderKind, ReminderLogEntry, WeekStatus } from "@/types/database";
import { addDays, parseDate, todayIn } from "@/lib/hospitality/week";

/** The capture a post type needs (the post type registry's capture field). */
export type CaptureNeed = "none" | "casual" | "shoot";

export interface ReminderWeek {
  id: string;
  status: WeekStatus;
  /** True once the week has been deployed (scheduled out). */
  deployed: boolean;
}

export interface ReminderPiece {
  id: string;
  week_id: string;
  /** Local scheduled date, YYYY-MM-DD, resolved by the caller. */
  date: string | null;
  /** Local scheduled time, HH:MM or HH:MM:SS. */
  time: string | null;
  approval_status: ApprovalStatus;
  /** Published by hand (the LinkedIn newsletter article). */
  manual_publish?: boolean;
  /** For a manual_publish piece: marked as published. */
  published?: boolean;
}

export interface ReminderCapture {
  id: string;
  /** Local date the content is needed for, YYYY-MM-DD. */
  date: string;
  capture: CaptureNeed;
  /**
   * Optional: true once this item's photo or video is in. A date stops being
   * reminded when every item on it is captured. Absent is treated as false,
   * so a caller that does not know keeps the old behaviour.
   */
  captured?: boolean;
}

export type ReminderLogRow = Pick<ReminderLogEntry, "recipient" | "kind" | "subject_key" | "is_follow_up" | "sent_at">;

export interface DueInput {
  cadence: Pick<CompanyCadence, "mode" | "reminder_hour" | "reminder_recipients">;
  /** companies.timezone, an IANA name such as Europe/London. */
  timeZone: string;
  slots: Pick<PostingSlot, "day_of_week" | "scheduled_time" | "is_active">[];
  weeks: ReminderWeek[];
  pieces: ReminderPiece[];
  captures: ReminderCapture[];
  log: ReminderLogRow[];
  now: Date;
}

export interface DueReminder {
  kind: ReminderKind;
  recipient: string;
  /** Piece id, week id or local date, matching reminder_log.subject_key. */
  subject_key: string;
  is_follow_up: boolean;
  piece_id: string | null;
  week_id: string | null;
}

/** Local hour of the "evening before" reminder for a casual capture. */
export const CAPTURE_EVENING_HOUR = 18;
/** Least time between a first send and its follow-up. */
export const FOLLOW_UP_MIN_GAP_HOURS = 12;
/** The same for todays_post, whose whole life is one morning. */
export const TODAYS_POST_FOLLOW_UP_GAP_HOURS = 2;
/** todays_post opens this long before the slot when that is earlier than the reminder hour. */
export const TODAYS_POST_LEAD_HOURS = 2;
/**
 * week_ready and deploy_week send only from the reminder hour until this
 * local hour (or for one hour, if the reminder hour is later than that).
 */
export const WEEK_REMINDERS_UNTIL_HOUR = 20;

const KIND_ORDER: ReminderKind[] = ["week_ready", "deploy_week", "todays_post", "manual_publish", "capture_due"];
const HOUR_MS = 60 * 60 * 1000;

// ------------------------------------------------------------------
// Time zone arithmetic
// ------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(timeZone: string, instant: number): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a local wall-clock time occurs in a zone. Two passes settle
 * the offset either side of a clock change; a time inside the spring-forward
 * gap lands just after it.
 */
export function zonedTime(ymd: string, time: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let t = wall - offsetAt(timeZone, wall);
  t = wall - offsetAt(timeZone, t);
  return new Date(t);
}

const hourText = (h: number) => `${String(h).padStart(2, "0")}:00`;

// ------------------------------------------------------------------
// The rules
// ------------------------------------------------------------------

interface Candidate {
  kind: ReminderKind;
  subject_key: string;
  piece_id: string | null;
  week_id: string | null;
  /** The first send is due from this instant... */
  firstFrom: Date;
  /** ...until this one (exclusive); null means no end. */
  firstUntil: Date | null;
  /** The follow-up is due from this instant; null means none. */
  followUpFrom: Date | null;
  followUpUntil: Date | null;
  /** Least time after the first send before the follow-up, in ms. */
  followUpGapMs: number;
  /** Send only inside the daytime window (week reminders). */
  daytimeOnly: boolean;
}

function normaliseRecipients(list: string[]): string[] {
  const out = new Set<string>();
  for (const r of list) {
    const clean = r.trim().toLowerCase();
    if (clean) out.add(clean);
  }
  return [...out].sort();
}

function firstPostAt(pieces: ReminderPiece[], timeZone: string): Date | null {
  let first: Date | null = null;
  for (const p of pieces) {
    if (!p.date) continue;
    const at = zonedTime(p.date, p.time ?? "00:00", timeZone);
    if (!first || at < first) first = at;
  }
  return first;
}

function candidates(input: DueInput): Candidate[] {
  const { cadence, timeZone, now } = input;
  const out: Candidate[] = [];
  const today = todayIn(timeZone, now);
  const atHour = (ymd: string, hour = cadence.reminder_hour) => zonedTime(ymd, hourText(hour), timeZone);
  const startOf = (ymd: string) => zonedTime(ymd, "00:00", timeZone);
  const gap = FOLLOW_UP_MIN_GAP_HOURS * HOUR_MS;

  // week_ready and deploy_week, one subject per week, weekly_batch only.
  // Both close at the week's first post; a week with no dated piece is skipped.
  if (cadence.mode === "weekly_batch") {
    for (const week of input.weeks) {
      const pieces = input.pieces.filter((p) => p.week_id === week.id);
      const allApproved = pieces.length > 0 && pieces.every((p) => p.approval_status === "approved");
      const first = firstPostAt(pieces, timeZone);
      if (!first) continue;
      const week_ = { subject_key: week.id, piece_id: null, week_id: week.id, followUpGapMs: gap, daytimeOnly: true };

      if (week.status === "ready_for_review" && !allApproved) {
        out.push({
          kind: "week_ready",
          ...week_,
          firstFrom: atHour(today),
          firstUntil: first,
          followUpFrom: new Date(first.getTime() - 24 * HOUR_MS),
          followUpUntil: first,
        });
      }

      if (week.status === "approved" && allApproved && !week.deployed) {
        out.push({
          kind: "deploy_week",
          ...week_,
          firstFrom: atHour(today),
          firstUntil: first,
          followUpFrom: atHour(todayIn(timeZone, first)),
          followUpUntil: first,
        });
      }
    }
  }

  // todays_post, one subject per piece scheduled today, in a week that has
  // reached review (never a draft week).
  const weekStatus = new Map(input.weeks.map((w) => [w.id, w.status]));
  const reviewable = (weekId: string) => {
    const status = weekStatus.get(weekId);
    return status === "ready_for_review" || status === "approved";
  };
  const postingDay = input.slots.some((s) => s.is_active && s.day_of_week === parseDate(today).getUTCDay());
  const wantsTodaysPost = cadence.mode === "daily" || (cadence.mode === "posting_days" && postingDay);
  if (wantsTodaysPost) {
    for (const p of input.pieces) {
      if (p.date !== today || p.approval_status === "approved" || !reviewable(p.week_id)) continue;
      const slot = p.time ? zonedTime(p.date, p.time, timeZone) : startOf(addDays(today, 1));
      const reminderAt = atHour(today);
      const lead = p.time ? new Date(slot.getTime() - TODAYS_POST_LEAD_HOURS * HOUR_MS) : reminderAt;
      out.push({
        kind: "todays_post",
        subject_key: p.id,
        piece_id: p.id,
        week_id: p.week_id,
        // The earlier of the reminder hour and two hours before the slot, so
        // an 08:26 post is reminded even with a 10:00 reminder hour.
        firstFrom: lead < reminderAt ? lead : reminderAt,
        firstUntil: slot,
        followUpFrom: p.time ? new Date(slot.getTime() - 2 * HOUR_MS) : null,
        followUpUntil: slot,
        followUpGapMs: TODAYS_POST_FOLLOW_UP_GAP_HOURS * HOUR_MS,
        daytimeOnly: false,
      });
    }
  }

  // manual_publish, one subject per hand-published piece, closing at the end
  // of the day after it is due.
  for (const p of input.pieces) {
    if (!p.manual_publish || p.published || !p.date) continue;
    const closes = startOf(addDays(p.date, 2));
    out.push({
      kind: "manual_publish",
      subject_key: p.id,
      piece_id: p.id,
      week_id: p.week_id,
      firstFrom: atHour(p.date),
      firstUntil: closes,
      followUpFrom: atHour(addDays(p.date, 1)),
      followUpUntil: closes,
      followUpGapMs: gap,
      daytimeOnly: false,
    });
  }

  // capture_due, one subject per local date. A date with any shoot is a
  // shoot date; its casual items ride along on the shoot reminders. A date
  // whose every item is captured is skipped.
  const byDate = new Map<string, CaptureNeed>();
  const outstanding = new Set<string>();
  for (const c of input.captures) {
    if (c.capture === "none") continue;
    if (byDate.get(c.date) !== "shoot") byDate.set(c.date, c.capture);
    if (!c.captured) outstanding.add(c.date);
  }
  for (const [date, need] of byDate) {
    if (!outstanding.has(date)) continue;
    if (need === "shoot") {
      // Never on the day itself.
      out.push({
        kind: "capture_due",
        subject_key: date,
        piece_id: null,
        week_id: null,
        firstFrom: atHour(addDays(date, -7)),
        firstUntil: startOf(date),
        followUpFrom: atHour(addDays(date, -2)),
        followUpUntil: startOf(date),
        followUpGapMs: gap,
        daytimeOnly: false,
      });
    } else {
      out.push({
        kind: "capture_due",
        subject_key: date,
        piece_id: null,
        week_id: null,
        firstFrom: atHour(addDays(date, -1), CAPTURE_EVENING_HOUR),
        firstUntil: startOf(addDays(date, 1)),
        followUpFrom: atHour(date),
        followUpUntil: startOf(addDays(date, 1)),
        followUpGapMs: gap,
        daytimeOnly: false,
      });
    }
  }

  return out;
}

const within = (now: Date, from: Date, until: Date | null) => now >= from && (until === null || now < until);

/** The reminders due now. Empty recipients means none. */
export function remindersDue(input: DueInput): DueReminder[] {
  const recipients = normaliseRecipients(input.cadence.reminder_recipients);
  if (recipients.length === 0) return [];

  const logged = new Map<string, ReminderLogRow>();
  const keyOf = (recipient: string, kind: ReminderKind, subject: string, followUp: boolean) =>
    `${recipient}|${kind}|${subject}|${followUp ? 1 : 0}`;
  for (const row of input.log) {
    logged.set(keyOf(row.recipient.trim().toLowerCase(), row.kind, row.subject_key, row.is_follow_up), row);
  }

  // The daytime window for week reminders, today in the company timezone.
  const { now, timeZone, cadence } = input;
  const today = todayIn(timeZone, now);
  const dayStart = zonedTime(today, hourText(cadence.reminder_hour), timeZone);
  const dayEnd = zonedTime(today, hourText(Math.max(cadence.reminder_hour + 1, WEEK_REMINDERS_UNTIL_HOUR)), timeZone);
  const daytime = now >= dayStart && now < dayEnd;

  const due: DueReminder[] = [];
  for (const c of candidates(input)) {
    if (c.daytimeOnly && !daytime) continue;
    for (const recipient of recipients) {
      const base = { kind: c.kind, recipient, subject_key: c.subject_key, piece_id: c.piece_id, week_id: c.week_id };
      const first = logged.get(keyOf(recipient, c.kind, c.subject_key, false));
      if (!first) {
        if (within(now, c.firstFrom, c.firstUntil)) due.push({ ...base, is_follow_up: false });
        continue;
      }
      if (!c.followUpFrom || logged.has(keyOf(recipient, c.kind, c.subject_key, true))) continue;
      const sentAt = new Date(first.sent_at);
      if (sentAt >= c.followUpFrom) continue;
      if (now.getTime() < sentAt.getTime() + c.followUpGapMs) continue;
      if (within(now, c.followUpFrom, c.followUpUntil)) due.push({ ...base, is_follow_up: true });
    }
  }

  return due.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.subject_key.localeCompare(b.subject_key) ||
      a.recipient.localeCompare(b.recipient) ||
      Number(a.is_follow_up) - Number(b.is_follow_up),
  );
}
