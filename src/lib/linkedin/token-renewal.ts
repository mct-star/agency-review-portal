import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { linkedInApp } from "./app";
import { refreshAccessToken } from "./client";
import { LinkedInTokenError } from "./token-error";
import { buildNotice, expiryState, noticeDue, noticeKey, type NoticeAccount, type NoticeKind } from "./token-expiry";

/**
 * The daily LinkedIn token job. For each active LinkedIn connection:
 *
 * 1. If the access token expires within 14 days, refresh it with the stored
 *    refresh token and save the new token and expiry. Connections that share
 *    one sign-in (a member and their pages) share one refresh token, so each
 *    distinct refresh token is used once and every row that holds it is updated.
 * 2. Whether or not that worked, warn when 7 days remain and again on expiry,
 *    by email and by Slack. Each notice is sent once per account per expiry
 *    date: the key is stored in platform_metadata.expiry_notices and claimed
 *    before sending, then released if every channel failed.
 *
 * Outcomes are recorded in platform_metadata.token_renewal (no tokens, no
 * LinkedIn reply bodies). Nothing here prints a token.
 */

export type RenewalOutcome = "refreshed" | "failed" | "unavailable" | "not_due";

export type AccountRow = {
  id: string;
  company_id: string;
  platform: string;
  account_name: string | null;
  is_active: boolean;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  platform_metadata: Record<string, unknown> | null;
};

export type Deps = {
  now?: Date;
  baseUrl: string;
  refresh?: typeof refreshAccessToken;
  sendEmail: (to: string, subject: string, html: string) => Promise<{ success: boolean }>;
  /** Returns false when Slack is not configured or the post failed. */
  postSlack: (text: string) => Promise<boolean>;
  alertEmail: string;
};

export type RenewalSummary = {
  accounts: number;
  refreshed: number;
  failed: number;
  unavailable: number;
  noticesSent: number;
  noticesFailed: number;
  perAccount: Array<{ accountId: string; renewal: RenewalOutcome; reason: string; notice: NoticeKind | null }>;
};

const meta = (row: AccountRow): Record<string, unknown> => (row.platform_metadata && typeof row.platform_metadata === "object" ? row.platform_metadata : {});
const sentKeys = (row: AccountRow): Record<string, unknown> => {
  const v = meta(row).expiry_notices;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

export async function runTokenRenewal(supabase: SupabaseClient, deps: Deps): Promise<RenewalSummary> {
  const now = deps.now ?? new Date();
  const refresh = deps.refresh ?? refreshAccessToken;
  const summary: RenewalSummary = { accounts: 0, refreshed: 0, failed: 0, unavailable: 0, noticesSent: 0, noticesFailed: 0, perAccount: [] };

  const { data } = await supabase
    .from("company_social_accounts")
    .select("id, company_id, platform, account_name, is_active, access_token_encrypted, refresh_token_encrypted, token_expires_at, platform_metadata")
    .in("platform", ["linkedin_personal", "linkedin_company"])
    .not("access_token_encrypted", "is", null);
  const rows = (Array.isArray(data) ? data : []) as AccountRow[];
  const active = rows.filter((r) => r.is_active);
  summary.accounts = active.length;
  if (!active.length) return summary;

  // 1. Renewal, once per distinct refresh token.
  const app = linkedInApp();
  const results = new Map<string, { outcome: RenewalOutcome; reason: string }>();
  const groups = new Map<string, AccountRow[]>();
  for (const row of rows) {
    if (!row.refresh_token_encrypted) continue;
    const g = groups.get(row.refresh_token_encrypted) ?? [];
    g.push(row);
    groups.set(row.refresh_token_encrypted, g);
  }
  const grouped = new Set<string>();
  for (const members of groups.values()) {
    members.forEach((m) => grouped.add(m.id));
    const needs = members.filter((m) => m.is_active && expiryState(m.token_expires_at, now).renewDue);
    if (!needs.length) { members.forEach((m) => results.set(m.id, { outcome: "not_due", reason: "" })); continue; }
    let outcome: RenewalOutcome; let reason = "";
    try {
      const appName = meta(members[0]).app;
      if (!app) { outcome = "unavailable"; reason = "the LinkedIn app credentials are not set on the server"; }
      else if (typeof appName === "string" && appName !== app.app) { outcome = "unavailable"; reason = "this connection was made through a different LinkedIn app, so it must be reconnected"; }
      else {
        const fresh = await refresh(decrypt(members[0].refresh_token_encrypted as string), app.clientId, app.clientSecret);
        const refreshEnc = encrypt(fresh.refreshToken ?? decrypt(members[0].refresh_token_encrypted as string));
        const accessEnc = encrypt(fresh.accessToken);
        for (const m of members) {
          const { error } = await supabase.from("company_social_accounts").update({
            access_token_encrypted: accessEnc,
            refresh_token_encrypted: refreshEnc,
            token_expires_at: fresh.expiresAt,
            platform_metadata: { ...meta(m), scope: fresh.scope || meta(m).scope, token_renewal: { at: now.toISOString(), outcome: "refreshed" } },
          }).eq("id", m.id).eq("company_id", m.company_id);
          if (error) throw new Error("could not save the renewed token");
          m.access_token_encrypted = accessEnc; m.refresh_token_encrypted = refreshEnc; m.token_expires_at = fresh.expiresAt;
          m.platform_metadata = { ...meta(m), token_renewal: { at: now.toISOString(), outcome: "refreshed" } };
        }
        outcome = "refreshed";
      }
    } catch (e) {
      outcome = "failed";
      reason = e instanceof LinkedInTokenError
        ? `LinkedIn refused the renewal${e.code ? ` (${e.code})` : ""}, so the connection has to be reconnected by hand`
        : "the renewal could not be completed";
      console.error(`[LinkedIn renewal] refresh failed status=${e instanceof LinkedInTokenError ? e.status : "n/a"} code=${e instanceof LinkedInTokenError ? e.code : "n/a"}`);
    }
    if (outcome !== "refreshed") {
      for (const m of needs) {
        await supabase.from("company_social_accounts").update({ platform_metadata: { ...meta(m), token_renewal: { at: now.toISOString(), outcome, reason } } }).eq("id", m.id).eq("company_id", m.company_id);
        m.platform_metadata = { ...meta(m), token_renewal: { at: now.toISOString(), outcome, reason } };
      }
    }
    for (const m of members) results.set(m.id, { outcome, reason });
  }
  for (const row of active) {
    if (grouped.has(row.id)) continue;
    // No refresh token stored: renewal is not possible.
    const due = expiryState(row.token_expires_at, now).renewDue;
    results.set(row.id, due ? { outcome: "unavailable", reason: "no refresh token is stored for this connection, so it must be reconnected by hand" } : { outcome: "not_due", reason: "" });
  }
  for (const r of results.values()) { if (r.outcome === "refreshed") summary.refreshed++; else if (r.outcome === "failed") summary.failed++; else if (r.outcome === "unavailable") summary.unavailable++; }
  // refreshed counted per row; report per group-row is fine for an operator summary.

  // 2. Notices, one message per company, one key per account per expiry date.
  const byCompany = new Map<string, Array<{ row: AccountRow; kind: NoticeKind }>>();
  for (const row of active) {
    const kind = noticeDue(row.token_expires_at, sentKeys(row), now);
    const res = results.get(row.id) ?? { outcome: "not_due" as RenewalOutcome, reason: "" };
    summary.perAccount.push({ accountId: row.id, renewal: res.outcome, reason: res.reason, notice: kind });
    if (!kind) continue;
    const list = byCompany.get(row.company_id) ?? [];
    list.push({ row, kind });
    byCompany.set(row.company_id, list);
  }
  for (const [companyId, items] of byCompany) {
    // Claim first, so two overlapping runs cannot both send.
    const claimed: Array<{ row: AccountRow; kind: NoticeKind; key: string; before: Record<string, unknown> }> = [];
    for (const { row, kind } of items) {
      const key = noticeKey(kind, row.token_expires_at as string);
      const before = meta(row);
      const next = { ...before, expiry_notices: { ...sentKeys(row), [key]: now.toISOString() } };
      const { error } = await supabase.from("company_social_accounts").update({ platform_metadata: next }).eq("id", row.id).eq("company_id", companyId);
      if (!error) claimed.push({ row, kind, key, before });
    }
    if (!claimed.length) continue;
    const accounts: NoticeAccount[] = claimed.map(({ row, kind }) => ({
      companyId,
      accountName: row.account_name || (row.platform === "linkedin_company" ? "LinkedIn page" : "LinkedIn profile"),
      kind,
      expiresAt: row.token_expires_at as string,
      renewalNote: results.get(row.id)?.reason ? `Automatic renewal did not work: ${results.get(row.id)?.reason}.` : "",
    }));
    const { subject, text, html } = buildNotice(accounts, deps.baseUrl);
    const emailed = await deps.sendEmail(deps.alertEmail, subject, html).then((r) => r.success).catch(() => false);
    const slacked = await deps.postSlack(`${subject}\n${text}`).catch(() => false);
    if (emailed || slacked) summary.noticesSent += claimed.length;
    else {
      summary.noticesFailed += claimed.length;
      // Release the claim so tomorrow's run tries again.
      for (const { row, before } of claimed) await supabase.from("company_social_accounts").update({ platform_metadata: before }).eq("id", row.id).eq("company_id", companyId);
    }
  }
  return summary;
}
