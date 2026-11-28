import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { linkedInPostStatus } from "@/lib/linkedin/analytics";
import { sendOpsAlert, type AlertDelivery, type OpsAlert } from "@/lib/alerts/ops-alert";
import { DIRECT_PROVIDERS, firstLineOf, loadJobContext, platformName, ukTime, type JobContext, type JobRef } from "./job-alerts";

/**
 * The daily live check. Every job published in the last 48 hours must have a
 * stored post ID and link, and, where the platform allows it (LinkedIn), the
 * post must still exist when read back with the account's token. Problems go
 * out as ONE summary alert; when all is well nothing is sent.
 *
 * Each problem is alerted once per job (the alert record), so a post that
 * stays broken is not repeated in tomorrow's summary.
 */

export const LIVE_WINDOW_MS = 48 * 60 * 60_000;
/** LinkedIn reads per run, one at a time, to stay inside the app's allowance. */
export const MAX_EXISTENCE_CHECKS = 40;

export type PublishedJob = {
  id: string;
  company_id: string;
  social_account_id: string | null;
  target_platform: string | null;
  external_id: string | null;
  external_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  publish_payload: Record<string, unknown> | null;
};

export type LiveProblem = { job: PublishedJob; problem: "no_post_id" | "no_link" | "post_missing" };
export type ExistenceResult = "live" | "missing" | "unknown";

/** Problems with the stored link alone. Pure. */
export function linkProblem(job: PublishedJob): LiveProblem["problem"] | null {
  if (!job.external_id?.trim()) return "no_post_id";
  if (!job.external_url?.trim()) return "no_link";
  return null;
}

const PROBLEM_TEXT: Record<LiveProblem["problem"], string> = {
  no_post_id: "no post ID was stored",
  no_link: "no live link was stored",
  post_missing: "LinkedIn no longer shows the post",
};

export function buildLiveSummary(problems: Array<LiveProblem & { ctx: JobContext }>, checked: number, baseUrl: string): OpsAlert {
  const count = problems.length;
  return {
    subject: `Publishing check: ${count} ${count === 1 ? "post needs" : "posts need"} a look`,
    intro: `Of ${checked} ${checked === 1 ? "post" : "posts"} published in the last 48 hours, ${count} ${count === 1 ? "has" : "have"} no confirmed live post.`,
    fields: problems.map(({ job, problem, ctx }) => ({
      label: `${ctx.accountName} (${platformName(job.target_platform)})`,
      value: `${ukTime(job.scheduled_for || job.published_at)}: ${firstLineOf(job.publish_payload)}. Problem: ${PROBLEM_TEXT[problem]}.`,
    })),
    fixUrl: `${baseUrl.replace(/\/+$/, "")}/publish`,
  };
}

export type LiveCheckPorts = {
  listPublished(since: Date): Promise<PublishedJob[]>;
  contextFor(jobs: JobRef[]): Promise<Map<string, JobContext>>;
  /** Existence on the platform; "unknown" for platforms that cannot be checked. */
  exists(job: PublishedJob): Promise<ExistenceResult>;
  claim(jobId: string): Promise<boolean>;
  release(jobId: string): Promise<void>;
  send(alert: OpsAlert): Promise<AlertDelivery>;
  baseUrl: string;
};

export type LiveCheckResult = { checked: number; problems: number; reported: number; unverified: number; alertSent: boolean };

export async function runLiveCheck(ports: LiveCheckPorts, now = new Date()): Promise<LiveCheckResult> {
  const jobs = await ports.listPublished(new Date(now.getTime() - LIVE_WINDOW_MS));
  const found: LiveProblem[] = [];
  let unverified = 0;
  let existenceChecks = 0;
  for (const job of jobs) {
    const problem = linkProblem(job);
    if (problem) { found.push({ job, problem }); continue; }
    if (existenceChecks >= MAX_EXISTENCE_CHECKS) { unverified++; continue; }
    const status = await ports.exists(job);
    if (status !== "unknown") existenceChecks++;
    if (status === "missing") found.push({ job, problem: "post_missing" });
    else if (status === "unknown") unverified++;
  }
  const result: LiveCheckResult = { checked: jobs.length, problems: found.length, reported: 0, unverified, alertSent: false };
  if (!found.length) return result;
  // Only problems not yet reported go in the summary.
  const fresh: LiveProblem[] = [];
  for (const p of found) if (await ports.claim(p.job.id)) fresh.push(p);
  if (!fresh.length) return result;
  const contexts = await ports.contextFor(fresh.map((p) => p.job));
  const withCtx = fresh.map((p) => ({ ...p, ctx: contexts.get(p.job.id) || { accountName: "an account", companyName: "unknown company" } }));
  const delivery = await ports.send(buildLiveSummary(withCtx, jobs.length, ports.baseUrl));
  if (delivery.delivered) { result.reported = fresh.length; result.alertSent = true; }
  else for (const p of fresh) await ports.release(p.job.id);
  return result;
}

// ------------------------------------------------------------
// Supabase adapter
// ------------------------------------------------------------

const COLUMNS = "id, company_id, social_account_id, target_platform, external_id, external_url, scheduled_for, published_at, publish_payload";

export function supabaseLiveCheckPorts(supabase: SupabaseClient, baseUrl: string, recipients: string[]): LiveCheckPorts {
  const tokens = new Map<string, string | null>();
  async function tokenFor(job: PublishedJob): Promise<string | null> {
    if (!job.social_account_id) return null;
    if (tokens.has(job.social_account_id)) return tokens.get(job.social_account_id) ?? null;
    const { data } = await supabase.from("company_social_accounts").select("access_token_encrypted, token_expires_at")
      .eq("id", job.social_account_id).eq("company_id", job.company_id).eq("is_active", true).maybeSingle();
    const expiry = data?.token_expires_at ? Date.parse(data.token_expires_at) : Number.NaN;
    let token: string | null = null;
    if (data?.access_token_encrypted && Number.isFinite(expiry) && expiry > Date.now()) {
      try { token = decrypt(data.access_token_encrypted); } catch { token = null; }
    }
    tokens.set(job.social_account_id, token);
    return token;
  }
  return {
    baseUrl,
    contextFor: (jobs) => loadJobContext(supabase, jobs),
    async listPublished(since) {
      const { data, error } = await supabase.from("publishing_jobs").select(COLUMNS)
        .in("publish_payload->>provider", [...DIRECT_PROVIDERS]).eq("status", "published").gte("published_at", since.toISOString())
        .order("published_at", { ascending: true }).limit(300);
      if (error) throw new Error("Could not read the published jobs.");
      return (data || []) as PublishedJob[];
    },
    async exists(job) {
      if (job.target_platform !== "linkedin_personal" && job.target_platform !== "linkedin_company") return "unknown";
      const token = await tokenFor(job);
      if (!token || !job.external_id) return "unknown";
      return linkedInPostStatus(token, job.external_id);
    },
    async claim(jobId) {
      const { error } = await supabase.from("publishing_alerts").insert({ job_id: jobId, kind: "live_check_missing" });
      if (!error) return true;
      if ((error as { code?: string }).code === "23505") return false;
      throw new Error("Could not record the alert.");
    },
    async release(jobId) {
      await supabase.from("publishing_alerts").delete().eq("job_id", jobId).eq("kind", "live_check_missing");
    },
    send: (alert) => sendOpsAlert(alert, recipients),
  };
}
