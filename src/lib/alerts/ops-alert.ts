import { sendEmail } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/email/invite-email";

/**
 * The portal's one alert channel for things AGENCY's own people must act on:
 * a Slack message (when SLACK_ALERT_WEBHOOK_URL is set) and an email through
 * the existing Resend sender (to ALERT_EMAIL_TO, or the admins when unset).
 *
 * Anything that needs to alert AGENCY, such as a failed post or a LinkedIn
 * connection about to expire, should call sendOpsAlert rather than build a
 * second channel.
 */

export type OpsAlert = {
  subject: string;
  /** Label and value pairs, shown in order. */
  fields: Array<{ label: string; value: string }>;
  /** The page where the problem is fixed. */
  fixUrl?: string;
  /** Optional line above the fields. */
  intro?: string;
};

export type AlertDelivery = { delivered: boolean; slack: "sent" | "skipped" | "failed"; emailed: number };

/** Alert text is plain: no em dashes, no control characters, bounded length. */
export function plain(value: string, max = 400): string {
  const text = String(value ?? "").replace(/[—–]/g, "-").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

const escapeSlack = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function slackText(alert: OpsAlert): string {
  const lines = [`*${escapeSlack(plain(alert.subject, 200))}*`];
  if (alert.intro) lines.push(escapeSlack(plain(alert.intro, 600)));
  for (const f of alert.fields) lines.push(`*${escapeSlack(plain(f.label, 60))}:* ${escapeSlack(plain(f.value, 600))}`);
  if (alert.fixUrl) lines.push(`Fix it here: <${alert.fixUrl}>`);
  return lines.join("\n");
}

export function emailHtml(alert: OpsAlert): string {
  const rows = alert.fields.map((f) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;vertical-align:top">${escapeHtml(plain(f.label, 60))}</td><td style="padding:2px 0">${escapeHtml(plain(f.value, 600))}</td></tr>`).join("");
  return `${alert.intro ? `<p>${escapeHtml(plain(alert.intro, 600))}</p>` : ""}<table style="border-collapse:collapse;font-size:14px">${rows}</table>${alert.fixUrl ? `<p><a href="${escapeHtml(alert.fixUrl)}">Fix it here</a></p>` : ""}`;
}

type AdminLookup = { from: (table: string) => { select: (cols: string) => { eq: (col: string, value: string) => PromiseLike<{ data: Array<{ email: string | null }> | null }> } } };

/** ALERT_EMAIL_TO (comma separated) when set, otherwise every admin's address. */
export async function alertRecipients(supabase: unknown): Promise<string[]> {
  const configured = (process.env.ALERT_EMAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  const { data } = await (supabase as AdminLookup).from("users").select("email").eq("role", "admin");
  return (data || []).map((u) => u.email || "").filter(Boolean);
}

export type OpsAlertDeps = {
  fetchImpl?: typeof fetch;
  email?: typeof sendEmail;
  webhookUrl?: string | null;
};

/** Sends one alert to Slack and email. Skips Slack cleanly when no webhook is set. Never throws. */
export async function sendOpsAlert(alert: OpsAlert, recipients: string[], deps: OpsAlertDeps = {}): Promise<AlertDelivery> {
  const webhook = deps.webhookUrl === undefined ? process.env.SLACK_ALERT_WEBHOOK_URL : deps.webhookUrl;
  const doFetch = deps.fetchImpl || fetch;
  const doEmail = deps.email || sendEmail;
  let slack: AlertDelivery["slack"] = "skipped";
  if (webhook) {
    try {
      const res = await doFetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: slackText(alert) }), signal: AbortSignal.timeout(10_000) });
      slack = res.ok ? "sent" : "failed";
    } catch {
      slack = "failed";
    }
  }
  let emailed = 0;
  for (const to of recipients) {
    try {
      const result = await doEmail({ to, subject: plain(alert.subject, 200), html: emailHtml(alert) });
      if (result.success) emailed += 1;
    } catch {
      // A failed address must not stop the others.
    }
  }
  return { delivered: slack === "sent" || emailed > 0, slack, emailed };
}
