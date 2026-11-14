/**
 * Loads one company's data for the reminder job and shapes it into the
 * `DueInput` that `remindersDue` (due.ts) expects.
 *
 * The service-role client bypasses RLS, so every query here filters on
 * `company_id` (and the one lookup keyed by the company's own id says so).
 *
 * Deployed and published are read from `publishing_jobs`, exactly as the
 * writers record them:
 *   - Deploy week (src/app/api/publish/deploy-week/route.ts) queues each
 *     approved feed post through /api/publish/linkedin-direct, which inserts a
 *     row with target_platform "linkedin_personal" and status "scheduled" (or
 *     "queued" with no time); it opens the blog through /api/publish/website,
 *     which leaves a "website" row (queued, running or published, the same
 *     states the deploy route treats as already sent). A week counts as
 *     deployed when any piece in it has one of those rows.
 *   - Mark as published (src/app/api/publish/newsletter/route.ts) inserts a
 *     row with target_platform "linkedin_newsletter" and status "published".
 *     A newsletter counts as published when that row exists.
 */
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ApprovalStatus, CadenceMode, WeekStatus } from "@/types/database";
import { ALL_POST_TYPES, type PostTypeCapture } from "@/lib/constants/post-types";
import { postDateFor } from "@/lib/export/post-date";
import { addDays, todayIn } from "@/lib/hospitality/week";
import type { CaptureNeed, DueInput, ReminderCapture, ReminderLogRow, ReminderPiece, ReminderWeek } from "./due";

export type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface CadenceRow {
  company_id: string;
  mode: CadenceMode;
  reminder_hour: number;
  reminder_recipients: string[];
}

export interface WeekRow {
  id: string;
  date_start: string;
  date_end: string;
  status: WeekStatus;
}

export interface PieceRow {
  id: string;
  week_id: string;
  title: string | null;
  content_type: string;
  markdown_body: string | null;
  post_type: string | null;
  approval_status: ApprovalStatus;
  day_of_week: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
}

export interface CompanyReminderData {
  input: DueInput;
  weeksById: Map<string, WeekRow>;
  piecesById: Map<string, PieceRow>;
  /** Lower-case email to first name, from users rows of this company. */
  firstNames: Map<string, string>;
}

export type LoadResult =
  | { status: "skipped"; reason: "company_not_found" | "hospitality" }
  | { status: "ok"; data: CompanyReminderData };

/** Weeks this far back (days past their end) and this far ahead (days before their start) are loaded. */
export const WEEKS_LOOK_BACK_DAYS = 7;
export const WEEKS_LOOK_AHEAD_DAYS = 14;
/** reminder_log rows older than this are not needed to decide what is due. */
const LOG_LOOK_BACK_DAYS = 60;

/** Job states that mean a piece has been deployed (see the header comment). */
const DEPLOYED: Record<string, readonly string[]> = {
  linkedin_personal: ["scheduled", "queued", "running", "published"],
  website: ["queued", "running", "published"],
};

function captureOf(postType: string | null): CaptureNeed {
  if (!postType) return "none";
  const found = ALL_POST_TYPES.find((p) => p.slug === postType || p.dbSlug === postType);
  return (found?.capture ?? "none") as PostTypeCapture;
}

/** The local date a piece posts on, or null when it has neither a date nor a day (never guessed, as scheduledForPiece). */
function pieceDate(piece: PieceRow, weekStart: string): string | null {
  const hasDay = !!piece.scheduled_date || (piece.day_of_week !== null && String(piece.day_of_week).trim() !== "");
  return hasDay ? postDateFor(piece, weekStart) : null;
}

export async function loadCompanyReminderData(
  supabase: SupabaseAdmin,
  cadence: CadenceRow,
  now: Date,
): Promise<LoadResult> {
  const companyId = cadence.company_id;

  const { data: company } = await supabase
    .from("companies")
    .select("id, timezone, post_pack")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return { status: "skipped", reason: "company_not_found" };
  // Hospitality venues are left out: their review pages sit behind the
  // business-to-business fence (src/lib/hospitality/b2b-only.ts), so every
  // link these emails carry would land on "not available".
  if ((company as { post_pack?: string | null }).post_pack === "hospitality") return { status: "skipped", reason: "hospitality" };
  const timeZone = (company as { timezone?: string | null }).timezone || "Europe/London";
  const today = todayIn(timeZone, now);

  const [{ data: slotRows }, { data: weekRows }, { data: userRows }, { data: logRows }] = await Promise.all([
    supabase.from("posting_slots").select("day_of_week, scheduled_time, is_active").eq("company_id", companyId),
    supabase
      .from("weeks")
      .select("id, date_start, date_end, status")
      .eq("company_id", companyId)
      .gte("date_end", addDays(today, -WEEKS_LOOK_BACK_DAYS))
      .lte("date_start", addDays(today, WEEKS_LOOK_AHEAD_DAYS)),
    supabase.from("users").select("email, full_name").eq("company_id", companyId),
    supabase
      .from("reminder_log")
      .select("recipient, kind, subject_key, is_follow_up, sent_at")
      .eq("company_id", companyId)
      .gte("sent_at", new Date(now.getTime() - LOG_LOOK_BACK_DAYS * 86_400_000).toISOString()),
  ]);

  const weeks = ((weekRows || []) as WeekRow[]);
  const weekIds = weeks.map((w) => w.id);

  let pieceRows: PieceRow[] = [];
  let jobRows: Array<{ content_piece_id: string; target_platform: string; status: string }> = [];
  if (weekIds.length > 0) {
    const { data } = await supabase
      .from("content_pieces")
      .select("id, week_id, title, content_type, markdown_body, post_type, approval_status, day_of_week, scheduled_date, scheduled_time")
      .eq("company_id", companyId)
      .in("week_id", weekIds);
    pieceRows = (data || []) as PieceRow[];
    if (pieceRows.length > 0) {
      const { data: jobs } = await supabase
        .from("publishing_jobs")
        .select("content_piece_id, target_platform, status")
        .eq("company_id", companyId)
        .in("content_piece_id", pieceRows.map((p) => p.id));
      jobRows = (jobs || []) as typeof jobRows;
    }
  }

  const weeksById = new Map(weeks.map((w) => [w.id, w]));
  const piecesById = new Map(pieceRows.map((p) => [p.id, p]));

  const deployedPieces = new Set(
    jobRows.filter((j) => DEPLOYED[j.target_platform]?.includes(j.status)).map((j) => j.content_piece_id),
  );
  const publishedNewsletters = new Set(
    jobRows.filter((j) => j.target_platform === "linkedin_newsletter" && j.status === "published").map((j) => j.content_piece_id),
  );

  // THE DATE BOUND (a guard that stays even once due.ts bounds these itself).
  // remindersDue puts no lower date limit on week_ready, deploy_week or
  // manual_publish, so a leftover week or article from long ago would be
  // reminded about now. So only these go in:
  //   - weeks with at least one piece scheduled today or later (company-local);
  //   - manual_publish for a newsletter due today or yesterday (company-local).
  const dateOf = new Map<string, string | null>();
  for (const p of pieceRows) {
    const week = weeksById.get(p.week_id);
    dateOf.set(p.id, week ? pieceDate(p, week.date_start) : null);
  }
  const yesterday = addDays(today, -1);
  const liveWeeks = weeks.filter((w) =>
    pieceRows.some((p) => p.week_id === w.id && (dateOf.get(p.id) ?? "") >= today && dateOf.get(p.id) !== null),
  );
  const liveWeekIds = new Set(liveWeeks.map((w) => w.id));

  const reminderWeeks: ReminderWeek[] = liveWeeks.map((w) => ({
    id: w.id,
    status: w.status,
    deployed: pieceRows.some((p) => p.week_id === w.id && deployedPieces.has(p.id)),
  }));

  const reminderPieces: ReminderPiece[] = [];
  const captures: ReminderCapture[] = [];
  for (const p of pieceRows) {
    if (!liveWeekIds.has(p.week_id)) continue;
    const date = dateOf.get(p.id) ?? null;
    // Only a LinkedIn newsletter article is published by hand with a reminder
    // (the email is newsletter-only): never a blog or any other piece. The
    // newsletter route only lets an approved article be marked published, so
    // only an approved one counts. And only one due today or yesterday.
    const manual =
      p.content_type === "linkedin_article" &&
      p.approval_status === "approved" &&
      date !== null &&
      date >= yesterday &&
      date <= today;
    reminderPieces.push({
      id: p.id,
      week_id: p.week_id,
      date,
      time: p.scheduled_time,
      approval_status: p.approval_status,
      manual_publish: manual,
      published: publishedNewsletters.has(p.id),
    });
    const need = captureOf(p.post_type);
    if (date && need !== "none") captures.push({ id: p.id, date, capture: need });
  }

  const firstNames = new Map<string, string>();
  for (const u of (userRows || []) as Array<{ email: string | null; full_name: string | null }>) {
    const email = u.email?.trim().toLowerCase();
    const first = u.full_name?.trim().split(/\s+/)[0];
    if (email && first) firstNames.set(email, first);
  }

  return {
    status: "ok",
    data: {
      input: {
        cadence: { mode: cadence.mode, reminder_hour: cadence.reminder_hour, reminder_recipients: cadence.reminder_recipients || [] },
        timeZone,
        slots: (slotRows || []) as DueInput["slots"],
        weeks: reminderWeeks,
        pieces: reminderPieces,
        captures,
        log: (logRows || []) as ReminderLogRow[],
        now,
      },
      weeksById,
      piecesById,
      firstNames,
    },
  };
}
