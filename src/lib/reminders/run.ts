/**
 * The hourly reminder job, behind /api/cron/reminders.
 *
 * For each company with a company_cadence row: load its data (load.ts), ask
 * remindersDue (due.ts) what is due, then for each recipient send at most one
 * email, log-first:
 *
 *   1. insert the reminder_log row;
 *   2. a unique violation means it was already sent, so skip;
 *   3. render, then send;
 *   4. if the send fails, delete that row (by id and company_id) so the next
 *      hourly run retries, and report the failure.
 *
 * One email per recipient per company-local calendar day. When several
 * reminders are due for a recipient in a run, the one sent is the first in
 * remindersDue's fixed order: kind (week_ready, deploy_week, todays_post,
 * manual_publish), then subject key, then first send before follow-up. The
 * rest are left, and are picked up on a later day if they are still due then.
 * capture_due has no email template: it is counted as not sent, and never
 * takes a recipient's one email for the day.
 *
 * Nothing is read or written for a company other than the one being
 * processed. A failure in one company is reported and does not stop the rest.
 */
import { renderReminderEmail, REMINDER_EMAIL_KINDS, capWords, type ReminderEmailInput, type ReminderEmailKind } from "@/lib/email/reminders/render";
import { sendEmail } from "@/lib/email/resend";
import { formatFrom, resolveSender } from "@/lib/email/sender";
import { longDateLabel, parseDate, todayIn } from "@/lib/hospitality/week";
import type { ReminderKind } from "@/types/database";
import { remindersDue, type DueReminder } from "./due";
import { loadCompanyReminderData, type CadenceRow, type CompanyReminderData, type PieceRow, type SupabaseAdmin, type WeekRow } from "./load";

export type ReminderMode = "off" | "dry_run" | "send";

/** The switch: only the exact values "dry_run" and "send" do anything. */
export function reminderMode(value: string | undefined): ReminderMode {
  return value === "dry_run" || value === "send" ? value : "off";
}

export interface ReminderFailure {
  companyId: string;
  recipient: string;
  kind: ReminderKind;
  subject_key: string;
  error: string;
  /** True when the log row could not be removed, so this reminder will not be retried until it is. */
  logCleanupFailed?: boolean;
}

export interface CompanySummary {
  companyId: string;
  skipped?: "company_not_found" | "hospitality" | "error";
  due: number;
  wouldSend: number;
  sent: number;
  alreadySent: number;
  heldByDailyLimit: number;
  noTemplate: number;
}

export interface RunSummary {
  mode: Exclude<ReminderMode, "off">;
  companies: CompanySummary[];
  failures: ReminderFailure[];
  totals: { due: number; wouldSend: number; sent: number; alreadySent: number; heldByDailyLimit: number; noTemplate: number; failed: number };
}

const isEmailKind = (kind: ReminderKind): kind is ReminderEmailKind => (REMINDER_EMAIL_KINDS as readonly string[]).includes(kind);

// ------------------------------------------------------------------
// Email content
// ------------------------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "10 to 16 November", or "30 November to 6 December" across a month end. */
export function weekLabel(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  return sameMonth
    ? `${s.getUTCDate()} to ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`
    : `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} to ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
}

const TYPE_LABEL: Record<string, string> = {
  social_post: "social post",
  video: "video",
  video_script: "video script",
  blog_article: "blog article",
  linkedin_article: "newsletter article",
  pdf_guide: "PDF guide",
  meme: "meme",
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function countsByType(pieces: PieceRow[]): string {
  const counts = new Map<string, number>();
  for (const p of pieces) counts.set(p.content_type, (counts.get(p.content_type) || 0) + 1);
  const parts = [...counts].map(([type, n]) => `${n} ${TYPE_LABEL[type] || "piece"}${n === 1 ? "" : "s"}`);
  return parts.length ? `This week has ${joinList(parts)}.` : "";
}

function plainPreview(markdown: string | null): string {
  return capWords((markdown || "").replace(/[#*_`>~]/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://agency-review-portal.vercel.app")).replace(/\/+$/, "");
}

/** The template input for a due reminder, with the real page paths: /review/[weekId], /review/[weekId]/deploy, /content/[pieceId]. */
export function emailInputFor(
  due: DueReminder & { kind: ReminderEmailKind },
  data: CompanyReminderData,
  baseUrl: string,
): ReminderEmailInput | null {
  const firstName = data.firstNames.get(due.recipient) ?? null;
  const common = { firstName, isFollowUp: due.is_follow_up };
  if (due.kind === "todays_post" || due.kind === "manual_publish") {
    const piece = data.piecesById.get(due.piece_id || "");
    if (!piece) return null;
    const url = `${baseUrl}/content/${piece.id}`;
    if (due.kind === "manual_publish") {
      return { kind: "manual_publish", ...common, newsletterTitle: piece.title?.trim() || "Untitled", publishUrl: url };
    }
    const date = piece.scheduled_date?.slice(0, 10) || data.input.pieces.find((p) => p.id === piece.id)?.date || todayIn(data.input.timeZone, data.input.now);
    return {
      kind: "todays_post",
      ...common,
      postDate: longDateLabel(date),
      postTitle: piece.title?.trim() || "Untitled",
      postPreview: plainPreview(piece.markdown_body),
      postUrl: url,
    };
  }
  const week: WeekRow | undefined = data.weeksById.get(due.week_id || "");
  if (!week) return null;
  const label = weekLabel(week.date_start, week.date_end);
  if (due.kind === "deploy_week") {
    return { kind: "deploy_week", ...common, weekLabel: label, deployUrl: `${baseUrl}/review/${week.id}/deploy` };
  }
  const pieces = [...data.piecesById.values()].filter((p) => p.week_id === week.id);
  const needRecording = data.input.captures.filter((c) => pieces.some((p) => p.id === c.id)).length;
  return {
    kind: "week_ready",
    ...common,
    weekLabel: label,
    countsByType: countsByType(pieces),
    recordingsNeeded: needRecording > 0 ? `${needRecording} ${needRecording === 1 ? "piece needs" : "pieces need"} a recording from you.` : null,
    reviewUrl: `${baseUrl}/review/${week.id}`,
  };
}

// ------------------------------------------------------------------
// The run
// ------------------------------------------------------------------

const PG_UNIQUE_VIOLATION = "23505";

async function runCompany(
  supabase: SupabaseAdmin,
  cadence: CadenceRow,
  mode: "dry_run" | "send",
  now: Date,
  failures: ReminderFailure[],
): Promise<CompanySummary> {
  const companyId = cadence.company_id;
  const summary: CompanySummary = { companyId, due: 0, wouldSend: 0, sent: 0, alreadySent: 0, heldByDailyLimit: 0, noTemplate: 0 };

  const loaded = await loadCompanyReminderData(supabase, cadence, now);
  if (loaded.status === "skipped") return { ...summary, skipped: loaded.reason };
  const data = loaded.data;
  const tz = data.input.timeZone;
  const today = todayIn(tz, now);

  const due = remindersDue(data.input);
  summary.due = due.length;

  // Recipients that already had an email today (company-local), from the log
  // and from what this run sends.
  const emailedToday = new Set(
    data.input.log.filter((row) => todayIn(tz, new Date(row.sent_at)) === today).map((row) => row.recipient.trim().toLowerCase()),
  );

  const baseUrl = appBaseUrl();
  const from = formatFrom(resolveSender());

  for (const item of due) {
    if (!isEmailKind(item.kind)) { summary.noTemplate += 1; continue; }
    if (emailedToday.has(item.recipient)) { summary.heldByDailyLimit += 1; continue; }

    const input = emailInputFor(item as DueReminder & { kind: ReminderEmailKind }, data, baseUrl);
    if (!input) { summary.noTemplate += 1; continue; }

    if (mode === "dry_run") {
      summary.wouldSend += 1;
      emailedToday.add(item.recipient);
      continue;
    }

    // Log first. A unique violation means this exact reminder already went.
    const { data: row, error: insertError } = await supabase
      .from("reminder_log")
      .insert({
        company_id: companyId,
        recipient: item.recipient,
        kind: item.kind,
        subject_key: item.subject_key,
        piece_id: item.piece_id,
        week_id: item.week_id,
        is_follow_up: item.is_follow_up,
      })
      .select("id")
      .single();
    if (insertError) {
      if ((insertError as { code?: string }).code === PG_UNIQUE_VIOLATION) { summary.alreadySent += 1; continue; }
      failures.push({ companyId, recipient: item.recipient, kind: item.kind, subject_key: item.subject_key, error: `Could not record the reminder: ${insertError.message}` });
      continue;
    }
    // Whatever happens next, this recipient has had (or been tried for) today's email.
    emailedToday.add(item.recipient);

    let error: string | null = null;
    try {
      const email = renderReminderEmail(input);
      const result = await sendEmail({ to: item.recipient, subject: email.subject, html: email.html, from });
      if (!result.success) error = result.error || "The email provider did not accept the message";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (!error) { summary.sent += 1; continue; }

    // Failed: remove the log row so the next run retries, and say so.
    emailedToday.delete(item.recipient);
    const failure: ReminderFailure = { companyId, recipient: item.recipient, kind: item.kind, subject_key: item.subject_key, error };
    const { error: deleteError } = await supabase
      .from("reminder_log")
      .delete()
      .eq("id", (row as { id: string }).id)
      .eq("company_id", companyId);
    if (deleteError) failure.logCleanupFailed = true;
    failures.push(failure);
  }

  return summary;
}

export async function runReminders(supabase: SupabaseAdmin, mode: "dry_run" | "send", now: Date = new Date()): Promise<RunSummary> {
  const failures: ReminderFailure[] = [];
  const companies: CompanySummary[] = [];

  // The one read that is not scoped to a company: the list of companies that
  // have a cadence. Everything after it is filtered on that company's id.
  const { data: cadences, error } = await supabase
    .from("company_cadence")
    .select("company_id, mode, reminder_hour, reminder_recipients");
  if (error) throw new Error(`Could not read company_cadence: ${error.message}`);

  for (const cadence of (cadences || []) as CadenceRow[]) {
    try {
      companies.push(await runCompany(supabase, cadence, mode, now, failures));
    } catch (e) {
      companies.push({ companyId: cadence.company_id, skipped: "error", due: 0, wouldSend: 0, sent: 0, alreadySent: 0, heldByDailyLimit: 0, noTemplate: 0 });
      failures.push({ companyId: cadence.company_id, recipient: "", kind: "week_ready", subject_key: "", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const sum = (key: "due" | "wouldSend" | "sent" | "alreadySent" | "heldByDailyLimit" | "noTemplate") => companies.reduce((n, c) => n + c[key], 0);
  return {
    mode,
    companies,
    failures,
    totals: {
      due: sum("due"), wouldSend: sum("wouldSend"), sent: sum("sent"), alreadySent: sum("alreadySent"),
      heldByDailyLimit: sum("heldByDailyLimit"), noTemplate: sum("noTemplate"), failed: failures.length,
    },
  };
}
