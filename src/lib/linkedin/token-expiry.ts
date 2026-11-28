/**
 * Pure rules for LinkedIn token expiry: when to renew, when to warn, and what
 * the warning says. No I/O, so every rule here is tested directly.
 */

export const RENEW_WITHIN_DAYS = 14;
export const WARN_WITHIN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type NoticeKind = "expiring_soon" | "expired";

export type ExpiryState = {
  /** Whole days left, rounded up. Negative or zero once expired. null when there is no expiry date. */
  daysLeft: number | null;
  expired: boolean;
  /** Within the 7 day warning window and not yet expired. */
  soon: boolean;
  /** Close enough (14 days) that a renewal should be attempted. */
  renewDue: boolean;
};

export function expiryState(expiresAt: string | null | undefined, now: Date = new Date()): ExpiryState {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(t)) return { daysLeft: null, expired: false, soon: false, renewDue: false };
  const ms = t - now.getTime();
  const daysLeft = Math.ceil(ms / DAY_MS);
  const expired = ms <= 0;
  return {
    daysLeft,
    expired,
    soon: !expired && ms <= WARN_WITHIN_DAYS * DAY_MS,
    renewDue: ms <= RENEW_WITHIN_DAYS * DAY_MS,
  };
}

/** The calendar date (UTC) the notice is keyed on, so one expiry date gets one notice of each kind. */
export function expiryDateKey(expiresAt: string): string {
  return new Date(expiresAt).toISOString().slice(0, 10);
}

export function noticeKey(kind: NoticeKind, expiresAt: string): string {
  return `${kind}:${expiryDateKey(expiresAt)}`;
}

/** Which notice, if any, an account is due for, given the keys already sent. */
export function noticeDue(expiresAt: string | null | undefined, sent: Record<string, unknown> | null | undefined, now: Date = new Date()): NoticeKind | null {
  if (!expiresAt) return null;
  const state = expiryState(expiresAt, now);
  const already = sent || {};
  if (state.expired) return already[noticeKey("expired", expiresAt)] ? null : "expired";
  if (state.soon) return already[noticeKey("expiring_soon", expiresAt)] ? null : "expiring_soon";
  return null;
}

export type NoticeAccount = {
  companyId: string;
  accountName: string;
  kind: NoticeKind;
  expiresAt: string;
  /** Why renewal did not or could not happen, in plain words. */
  renewalNote: string;
};

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const longDate = (iso: string): string => LONG_DATE.format(new Date(iso));

export function reconnectUrl(baseUrl: string, companyId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/setup/${companyId}/social`;
}

/** One message per company, listing every account that is due a notice. Plain British English, no em dashes. */
export function buildNotice(accounts: NoticeAccount[], baseUrl: string): { subject: string; text: string; html: string } {
  const expired = accounts.some((a) => a.kind === "expired");
  const url = reconnectUrl(baseUrl, accounts[0].companyId);
  const lines = accounts.map((a) =>
    a.kind === "expired"
      ? `${a.accountName}: expired on ${longDate(a.expiresAt)}. Publishing to this account has stopped.`
      : `${a.accountName}: expires on ${longDate(a.expiresAt)}.`
  );
  const names = accounts.map((a) => a.accountName).join(", ");
  const subject = expired ? `LinkedIn connection expired: ${names}` : `LinkedIn connection expires soon: ${names}`;
  const note = accounts.find((a) => a.renewalNote)?.renewalNote || "";
  const text = [
    expired ? "A LinkedIn connection has expired, so posts to it will not publish." : "A LinkedIn connection is about to expire. After that date posts to it will not publish.",
    "",
    ...lines,
    ...(note ? ["", note] : []),
    "",
    `Reconnect LinkedIn here: ${url}`,
    "",
    "Sign in to the portal as an admin, open that page and choose Reconnect LinkedIn.",
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p>${esc(expired ? "A LinkedIn connection has expired, so posts to it will not publish." : "A LinkedIn connection is about to expire. After that date posts to it will not publish.")}</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${note ? `<p>${esc(note)}</p>` : ""}<p><a href="${esc(url)}">Reconnect LinkedIn</a></p><p>Sign in to the portal as an admin, open that page and choose Reconnect LinkedIn.</p>`;
  return { subject, text, html };
}
