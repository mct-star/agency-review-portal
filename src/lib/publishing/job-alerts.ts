import type { SupabaseClient } from "@supabase/supabase-js";
import { alertRecipients, plain, sendOpsAlert, type AlertDelivery, type OpsAlert } from "@/lib/alerts/ops-alert";

/**
 * Alerts for the direct publishing queues (LinkedIn, Meta and the other
 * direct social platforms). The watcher cron runs every five minutes and
 * alerts, once per job and kind, when:
 * - a job failed,
 * - a job published but its first comment failed, or
 * - a job is still not published LATE_AFTER_MS after its scheduled time.
 * A job that is waiting for its one automatic retry is not "failed", so it
 * is not alerted until the retry has also failed.
 */

export const LATE_AFTER_MS = 15 * 60_000;
/** Only jobs from the last 12 hours are looked at, so a first run cannot dig up old history. */
export const LOOKBACK_MS = 12 * 60 * 60_000;
/** At most this many alerts per run; the rest wait for the next run. */
export const MAX_ALERTS_PER_RUN = 10;

export const DIRECT_PROVIDERS = ["linkedin-direct-v1", "meta-direct-v1", "direct-social-v1"] as const;

export type AlertKind = "failed" | "comment_failed" | "late";

export type WatchJob = {
  id: string;
  company_id: string;
  social_account_id: string | null;
  target_platform: string | null;
  status: string;
  scheduled_for: string | null;
  created_at: string | null;
  published_at: string | null;
  error_message: string | null;
  publish_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
};

/** Which alert, if any, a job calls for right now. Pure. */
export function alertKindFor(job: WatchJob, now: Date): AlertKind | null {
  if (job.status === "failed") return "failed";
  if (job.status === "published") return job.response_payload?.comment_failed === true ? "comment_failed" : null;
  if (["queued", "scheduled", "running"].includes(job.status) && job.scheduled_for) {
    const due = Date.parse(job.scheduled_for);
    if (Number.isFinite(due) && now.getTime() - due >= LATE_AFTER_MS) return "late";
  }
  return null;
}

/** The first non-empty line of the post, whichever platform's payload it sits in. */
export function firstLineOf(payload: Record<string, unknown> | null): string {
  const text = [payload?.commentary, payload?.caption, payload?.text].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const line = (text || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return line ? plain(line, 140) : "(the post text could not be read)";
}

const PLATFORM_NAMES: Record<string, string> = { linkedin_personal: "LinkedIn profile", linkedin_company: "LinkedIn page", facebook: "Facebook", instagram: "Instagram" };

export function platformName(platform: string | null): string {
  return PLATFORM_NAMES[platform || ""] || plain(platform || "unknown platform", 40);
}

/** Scheduled time as a reader in the UK would write it, for example "Tue 1 Dec 2026, 08:30". */
export function ukTime(iso: string | null): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(ms)) return "not scheduled";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

export type JobRef = { id: string; company_id: string; social_account_id: string | null };
export type JobContext = { accountName: string; companyName: string };

export function buildJobAlert(job: WatchJob, kind: AlertKind, ctx: JobContext, baseUrl: string): OpsAlert {
  const account = `${ctx.accountName} (${platformName(job.target_platform)}, ${ctx.companyName})`;
  const retried = Number((job.publish_payload as { retry_count?: unknown } | null)?.retry_count) >= 1;
  const base = {
    fields: [] as OpsAlert["fields"],
    fixUrl: `${baseUrl.replace(/\/+$/, "")}/publish`,
  };
  const common = (error: string): OpsAlert["fields"] => [
    { label: "Account", value: account },
    { label: "Scheduled for", value: ukTime(job.scheduled_for) },
    { label: "Post starts", value: firstLineOf(job.publish_payload) },
    { label: "Error", value: error },
  ];
  if (kind === "failed") {
    const error = plain(job.error_message || "No error was recorded.") + (retried ? " It was retried once automatically and failed again." : "");
    return { ...base, subject: `Post failed to publish: ${ctx.accountName}`, fields: common(error) };
  }
  if (kind === "comment_failed") {
    return { ...base, subject: `First comment missing: ${ctx.accountName}`, intro: "The post is live, but its first comment was not added. Add it by hand.", fields: common(plain(job.error_message || "The first comment was not added.")) };
  }
  const waiting = job.status === "running" ? "It started publishing but has not finished." : `It is still ${job.status}.`;
  return { ...base, subject: `Post is late: ${ctx.accountName}`, fields: common(`Not published 15 minutes after its scheduled time. ${waiting}`) };
}

/** What the watcher needs from the outside world, so tests can use plain objects. */
export type WatchPorts = {
  listCandidates(since: Date, now: Date): Promise<WatchJob[]>;
  contextFor(jobs: JobRef[]): Promise<Map<string, JobContext>>;
  /** Records that this job and kind are being alerted. False when already recorded. */
  claim(jobId: string, kind: AlertKind): Promise<boolean>;
  release(jobId: string, kind: AlertKind): Promise<void>;
  send(alert: OpsAlert): Promise<AlertDelivery>;
  baseUrl: string;
};

export type WatchResult = { checked: number; alerted: number; skippedAlreadySent: number; undelivered: number; deferred: number };

export async function runPublishingWatch(ports: WatchPorts, now = new Date()): Promise<WatchResult> {
  const jobs = await ports.listCandidates(new Date(now.getTime() - LOOKBACK_MS), now);
  const due = jobs.map((job) => ({ job, kind: alertKindFor(job, now) })).filter((j): j is { job: WatchJob; kind: AlertKind } => j.kind !== null);
  const result: WatchResult = { checked: jobs.length, alerted: 0, skippedAlreadySent: 0, undelivered: 0, deferred: 0 };
  if (!due.length) return result;
  const contexts = await ports.contextFor(due.map((d) => d.job));
  for (const { job, kind } of due) {
    if (result.alerted >= MAX_ALERTS_PER_RUN) { result.deferred++; continue; }
    if (!(await ports.claim(job.id, kind))) { result.skippedAlreadySent++; continue; }
    const ctx = contexts.get(job.id) || { accountName: "an account", companyName: "unknown company" };
    const delivery = await ports.send(buildJobAlert(job, kind, ctx, ports.baseUrl));
    if (delivery.delivered) result.alerted++;
    else {
      // Nothing got through (no Slack webhook and no email sent): release the claim so the next run tries again.
      await ports.release(job.id, kind);
      result.undelivered++;
    }
  }
  return result;
}

// ------------------------------------------------------------
// Supabase adapter
// ------------------------------------------------------------

const JOB_COLUMNS = "id, company_id, social_account_id, target_platform, status, scheduled_for, created_at, published_at, error_message, publish_payload, response_payload";

/** Account and company names for a set of jobs, read tenant-scoped (an account counts only inside its own company). */
export async function loadJobContext(supabase: SupabaseClient, jobs: JobRef[]): Promise<Map<string, JobContext>> {
  const accountIds = [...new Set(jobs.map((j) => j.social_account_id).filter((v): v is string => !!v))];
  const companyIds = [...new Set(jobs.map((j) => j.company_id))];
  const [{ data: accounts }, { data: companies }] = await Promise.all([
    accountIds.length ? supabase.from("company_social_accounts").select("id, company_id, account_name").in("id", accountIds) : Promise.resolve({ data: [] as Array<{ id: string; company_id: string; account_name: string | null }> }),
    supabase.from("companies").select("id, name").in("id", companyIds),
  ]);
  const out = new Map<string, JobContext>();
  for (const job of jobs) {
    const account = (accounts || []).find((a) => a.id === job.social_account_id && a.company_id === job.company_id);
    const company = (companies || []).find((c) => c.id === job.company_id);
    out.set(job.id, { accountName: plain(account?.account_name || "an account", 80), companyName: plain(company?.name || "unknown company", 80) });
  }
  return out;
}

export function supabasePorts(supabase: SupabaseClient, baseUrl: string, recipients: string[]): WatchPorts {
  const providers = [...DIRECT_PROVIDERS];
  return {
    baseUrl,
    async listCandidates(since, now) {
      const sinceIso = since.toISOString();
      const lateBefore = new Date(now.getTime() - LATE_AFTER_MS).toISOString();
      const [failed, comment, late] = await Promise.all([
        supabase.from("publishing_jobs").select(JOB_COLUMNS).in("publish_payload->>provider", providers).eq("status", "failed")
          .or(`scheduled_for.gte.${sinceIso},and(scheduled_for.is.null,created_at.gte.${sinceIso})`).limit(100),
        supabase.from("publishing_jobs").select(JOB_COLUMNS).in("publish_payload->>provider", providers).eq("status", "published")
          .eq("response_payload->>comment_failed", "true").gte("published_at", sinceIso).limit(100),
        supabase.from("publishing_jobs").select(JOB_COLUMNS).in("publish_payload->>provider", providers).in("status", ["queued", "scheduled", "running"])
          .gte("scheduled_for", sinceIso).lte("scheduled_for", lateBefore).limit(100),
      ]);
      for (const r of [failed, comment, late]) if (r.error) throw new Error("Could not read the publishing queue.");
      return [...(failed.data || []), ...(comment.data || []), ...(late.data || [])] as WatchJob[];
    },
    contextFor: (jobs) => loadJobContext(supabase, jobs),
    async claim(jobId, kind) {
      const { error } = await supabase.from("publishing_alerts").insert({ job_id: jobId, kind });
      if (!error) return true;
      if ((error as { code?: string }).code === "23505") return false;
      // Any other failure: do not alert without a record, or the next run would alert again.
      throw new Error("Could not record the alert.");
    },
    async release(jobId, kind) {
      await supabase.from("publishing_alerts").delete().eq("job_id", jobId).eq("kind", kind);
    },
    send: (alert) => sendOpsAlert(alert, recipients),
  };
}
