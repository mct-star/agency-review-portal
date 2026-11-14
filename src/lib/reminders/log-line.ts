/**
 * The one line the hourly reminder job writes to the runtime logs per run.
 *
 *   reminders: {"mode":"dry_run","companies":3,"totals":{...},"dueByKind":{...},"skippedByReason":{...},"failures":[...]}
 *
 * Privacy: the line holds counts and fixed words only. It never carries an
 * email address, a first name, a piece or newsletter title, a link, a company
 * name or an environment value. Company ids appear only inside failure
 * entries. Failure error text comes from the email provider and the database,
 * so it is cleaned (addresses and links removed, length capped) before it is
 * logged.
 */
import type { ReminderKind } from "@/types/database";
import type { RunSummary } from "./run";

export const LOG_PREFIX = "reminders:";

const MAX_ERROR_LENGTH = 120;

/** Error text made safe to log: no address, no link, no "@", one short line. */
export function safeErrorText(text: unknown): string {
  const raw = text instanceof Error ? text.message : String(text ?? "");
  const clean = raw
    .replace(/\S*@\S*/g, "[removed]")
    .replace(/(?:https?:\/\/|www\.)\S*/gi, "[removed]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > MAX_ERROR_LENGTH ? `${clean.slice(0, MAX_ERROR_LENGTH)}...` : clean;
}

export interface SummaryLogEntry {
  mode: RunSummary["mode"];
  companies: number;
  totals: RunSummary["totals"];
  dueByKind: Partial<Record<ReminderKind, number>>;
  skippedByReason: Record<string, number>;
  failures: Array<{ companyId: string; kind: ReminderKind; error: string }>;
}

/** The log entry for a run, from counts only. Pure, so it can be tested directly. */
export function summaryLogEntry(summary: RunSummary): SummaryLogEntry {
  const skippedByReason: Record<string, number> = {};
  for (const item of summary.skipped) {
    const reason = safeErrorText(item.reason);
    skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
  }
  return {
    mode: summary.mode,
    companies: summary.companies.length,
    totals: summary.totals,
    dueByKind: summary.dueByKind,
    skippedByReason,
    failures: summary.failures.map((f) => ({ companyId: f.companyId, kind: f.kind, error: safeErrorText(f.error) })),
  };
}

/** The whole line: the prefix, a space, then compact JSON. */
export function summaryLogLine(summary: RunSummary): string {
  return `${LOG_PREFIX} ${JSON.stringify(summaryLogEntry(summary))}`;
}

/** The line for a run that threw: the prefix and the cleaned error message only. */
export function errorLogLine(error: unknown): string {
  return `${LOG_PREFIX} ${safeErrorText(error)}`;
}
