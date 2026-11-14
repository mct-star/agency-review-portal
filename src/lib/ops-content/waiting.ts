import { todayIn } from "@/lib/hospitality/week";
import { appBaseUrl, pieceUrl, weekDeployUrl, weekReviewUrl } from "@/lib/reminders/links";
import { loadCompanyReminderData, type CadenceRow } from "@/lib/reminders/load";
import { db, principal } from "./store";

export type WaitingKind = "week_ready" | "deploy_week" | "todays_post" | "manual_publish";
export interface WaitingItem { kind: WaitingKind; count: number; label: string; href: string }
export interface WaitingRecording { pieceId: string; title: string; date: string; capture: "casual" | "shoot"; href: string }
export interface Waiting { asOf: string; items: WaitingItem[]; recordings: WaitingRecording[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What is waiting on the owner for the bridge company only. Read-only: no
 * write, no log row, no email. States come from the loaded weeks and pieces,
 * not from remindersDue, which is time-windowed and recipient-specific.
 * The loader's own bounds apply (weeks with a post today or later), so a week
 * from long ago is never listed. The loader filters every query on company_id.
 */
export async function waiting(now: Date = new Date()): Promise<Waiting> {
  const companyId = principal().companyId;
  const empty: Waiting = { asOf: now.toISOString(), items: [], recordings: [] };
  // The cadence only supplies what the loader needs to run; its mode and recipients are not used here.
  const cadence: CadenceRow = { company_id: companyId, mode: "weekly_batch", reminder_hour: 8, reminder_recipients: [] };
  const loaded = await loadCompanyReminderData(await db(), cadence, now);
  if (loaded.status !== "ok") return empty;

  const { input, weeksById, piecesById } = loaded.data;
  const base = appBaseUrl(), today = todayIn(input.timeZone, now);
  const start = (weekId: string) => weeksById.get(weekId)?.date_start ?? "";
  const earliestWeek = <T extends { id: string }>(weeks: T[]) => [...weeks].sort((a, b) => start(a.id).localeCompare(start(b.id)) || a.id.localeCompare(b.id))[0];
  const earliestPiece = <T extends { id: string; date: string | null }>(pieces: T[]) => [...pieces].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id))[0];
  const piecesOf = (weekId: string) => input.pieces.filter((p) => p.week_id === weekId);

  const items: WaitingItem[] = [];

  const weekReady = input.weeks.filter((w) => w.status === "ready_for_review" && piecesOf(w.id).some((p) => p.approval_status !== "approved"));
  if (weekReady.length) items.push({ kind: "week_ready", count: weekReady.length, label: `${plural(weekReady.length, "week", "weeks")} to review`, href: weekReviewUrl(base, earliestWeek(weekReady).id) });

  const deployWeek = input.weeks.filter((w) => {
    const pieces = piecesOf(w.id);
    return w.status === "approved" && !w.deployed && pieces.length > 0 && pieces.every((p) => p.approval_status === "approved");
  });
  if (deployWeek.length) items.push({ kind: "deploy_week", count: deployWeek.length, label: `${plural(deployWeek.length, "approved week", "approved weeks")} to deploy`, href: weekDeployUrl(base, earliestWeek(deployWeek).id) });

  const todays = input.pieces.filter((p) => p.date === today && p.approval_status !== "approved");
  if (todays.length) items.push({ kind: "todays_post", count: todays.length, label: `${plural(todays.length, "post", "posts")} to approve today`, href: pieceUrl(base, earliestPiece(todays).id) });

  const manual = input.pieces.filter((p) => p.manual_publish && !p.published);
  if (manual.length) items.push({ kind: "manual_publish", count: manual.length, label: `${plural(manual.length, "newsletter", "newsletters")} to publish`, href: pieceUrl(base, earliestPiece(manual).id) });

  // Raw footage uploaded clears a recording (the loader sets `captured`). A
  // past-dated piece is no longer a recording to do, so only today onwards.
  const recordings: WaitingRecording[] = input.captures
    .filter((c) => !c.captured && c.date >= today && c.capture !== "none" && piecesById.has(c.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((c) => ({ pieceId: c.id, title: (piecesById.get(c.id)?.title ?? "").replace(/\s+/g, " ").trim() || "Untitled piece", date: c.date, capture: c.capture as "casual" | "shoot", href: pieceUrl(base, c.id) }));

  return { asOf: now.toISOString(), items, recordings };
}
