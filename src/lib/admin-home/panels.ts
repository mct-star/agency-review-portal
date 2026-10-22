import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ageLabel, type Panel } from "./types";

type Supabase = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

const MAX_ROWS = 5;
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

type CompanyLite = { id: string; name: string; post_pack: string | null };

async function companyNames(supabase: Supabase): Promise<Map<string, CompanyLite>> {
  const { data } = await supabase.from("companies").select("id, name, post_pack");
  return new Map(((data || []) as CompanyLite[]).map((c) => [c.id, c]));
}

/** Where a pending draft is decided: the venue's approvals page, or the piece itself. */
function draftHref(piece: { id: string; company_id: string }, company?: CompanyLite): string {
  if (company?.post_pack === "hospitality") return `/approvals?company=${piece.company_id}`;
  return `/content/${piece.id}`;
}

/**
 * Waiting: drafts and photos waiting for a decision, across every client.
 * Approve runs the same routes the pages use.
 */
export async function loadWaiting(supabase: Supabase, now = Date.now()): Promise<Panel> {
  const base: Panel = { key: "waiting", title: "Waiting", numbers: [], rows: [], seeAll: { label: "All reviews", href: "/review" } };
  try {
    const [drafts, photos, approved, companies] = await Promise.all([
      supabase.from("content_pieces").select("id, company_id, title, post_type, content_type, created_at").eq("approval_status", "pending").order("created_at", { ascending: true }).limit(50),
      supabase.from("photo_inventory").select("id, company_id, original_filename, scene_label, added_at").eq("status", "pending").order("added_at", { ascending: true }).limit(50),
      supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("approval_status", "approved"),
      companyNames(supabase),
    ]);
    if (drafts.error) throw new Error(drafts.error.message);
    if (photos.error) throw new Error(photos.error.message);

    const draftRows = (drafts.data || []) as { id: string; company_id: string; title: string | null; post_type: string | null; content_type: string; created_at: string }[];
    const photoRows = (photos.data || []) as { id: string; company_id: string; original_filename: string | null; scene_label: string | null; added_at: string }[];

    base.numbers = [
      { label: "Drafts waiting", value: draftRows.length, tone: draftRows.length > 0 ? "warn" : "plain" },
      { label: "Photos waiting", value: photoRows.length, tone: photoRows.length > 0 ? "warn" : "plain" },
      { label: "Approved, not sent", value: approved.count ?? 0 },
    ];

    const rows = [
      ...draftRows.map((p) => {
        const company = companies.get(p.company_id);
        return {
          at: p.created_at,
          row: {
            id: `draft-${p.id}`,
            title: p.title || p.post_type || "Untitled draft",
            sub: `${company?.name ?? "Unknown company"} · ${p.content_type.replace("_", " ")}`,
            href: draftHref(p, company),
            ageLabel: ageLabel(p.created_at, now),
            verbs: [
              { label: "Approve", method: "POST" as const, path: "/api/content/approve", body: { pieceId: p.id, status: "approved" }, tone: "primary" as const },
            ],
          },
        };
      }),
      ...photoRows.map((ph) => {
        const company = companies.get(ph.company_id);
        return {
          at: ph.added_at,
          row: {
            id: `photo-${ph.id}`,
            title: ph.scene_label || ph.original_filename || "Photo from the team",
            sub: `${company?.name ?? "Unknown company"} · photo`,
            href: company?.post_pack === "hospitality" ? `/approvals?company=${ph.company_id}` : `/admin/bank?company=${ph.company_id}`,
            ageLabel: ageLabel(ph.added_at, now),
            verbs: [
              { label: "Approve", method: "POST" as const, path: "/api/bank/review", body: { companyId: ph.company_id, ids: [ph.id], decision: "approve" }, tone: "primary" as const },
              { label: "Reject", method: "POST" as const, path: "/api/bank/review", body: { companyId: ph.company_id, ids: [ph.id], decision: "reject" }, tone: "danger" as const, confirm: "Reject this photo? The team will not see it in the library." },
            ],
          },
        };
      }),
    ]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(0, MAX_ROWS)
      .map((r) => r.row);

    return { ...base, rows };
  } catch (err) {
    return { ...base, error: `Could not read what is waiting: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

/**
 * Clients: every company, with trials ending soon and companies that have
 * gone quiet first. "View as" opens their view.
 */
export async function loadClients(supabase: Supabase, now = Date.now()): Promise<Panel> {
  const base: Panel = { key: "clients", title: "Clients", numbers: [], rows: [], seeAll: { label: "All companies", href: "/setup" } };
  try {
    const [companies, lastPieces] = await Promise.all([
      supabase.from("companies").select("id, name, slug, plan, trial_plan, trial_expires_at, post_pack, created_at").order("name"),
      supabase.from("content_pieces").select("company_id, created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (companies.error) throw new Error(companies.error.message);
    const rowsIn = (companies.data || []) as { id: string; name: string; slug: string; plan: string; trial_plan: string | null; trial_expires_at: string | null; post_pack: string | null; created_at: string }[];
    const lastActivity = new Map<string, string>();
    for (const p of (lastPieces.data || []) as { company_id: string; created_at: string }[]) {
      if (!lastActivity.has(p.company_id)) lastActivity.set(p.company_id, p.created_at);
    }
    const platformSlug = process.env.PLATFORM_COMPANY_SLUG || "agency-bristol";
    const clients = rowsIn.filter((c) => c.slug !== platformSlug && !/test/i.test(c.slug));

    const trialSoon = clients.filter((c) => c.trial_expires_at && Date.parse(c.trial_expires_at) > now && Date.parse(c.trial_expires_at) - now < ONE_WEEK);
    const quiet = clients.filter((c) => {
      const last = lastActivity.get(c.id);
      return !last || now - Date.parse(last) > TWO_WEEKS;
    });

    base.numbers = [
      { label: "Clients", value: clients.length },
      { label: "Trials ending in 7 days", value: trialSoon.length, tone: trialSoon.length > 0 ? "warn" : "plain" },
      { label: "Quiet for 14 days", value: quiet.length },
    ];

    const ranked = [
      ...trialSoon.map((c) => ({ c, why: `Trial ends ${new Date(c.trial_expires_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` })),
      ...quiet.filter((c) => !trialSoon.includes(c)).map((c) => ({ c, why: lastActivity.has(c.id) ? `Last post ${ageLabel(lastActivity.get(c.id), now)}` : "No posts yet" })),
    ].slice(0, MAX_ROWS);

    return {
      ...base,
      rows: ranked.map(({ c, why }) => ({
        id: `company-${c.id}`,
        title: c.name,
        sub: `${c.post_pack === "hospitality" ? "Hospitality" : "Business to business"} · ${c.trial_plan ? `${c.trial_plan} trial` : c.plan} · ${why}`,
        href: `/setup/${c.id}`,
        verbs: [{ label: "View as", method: "POST" as const, path: "/api/view-as", body: { companyId: c.id } }],
      })),
    };
  } catch (err) {
    return { ...base, error: `Could not read the clients: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

/**
 * Jobs: generation and publishing jobs that failed in the last seven days.
 * There is no safe generic retry route, so each row links to where the job
 * was started; nothing here pretends to retry.
 */
export async function loadJobs(supabase: Supabase, now = Date.now()): Promise<Panel> {
  const base: Panel = { key: "jobs", title: "Jobs", numbers: [], rows: [], seeAll: { label: "Week board", href: "/admin/weeks" } };
  try {
    const since = new Date(now - ONE_WEEK).toISOString();
    const [gen, pub, completed, running, companies] = await Promise.all([
      supabase.from("content_generation_jobs").select("id, company_id, job_type, provider, error_message, created_at").eq("status", "failed").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      supabase.from("publishing_jobs").select("id, company_id, target_platform, error_message, created_at").eq("status", "failed").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      supabase.from("content_generation_jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("created_at", since),
      supabase.from("content_generation_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
      companyNames(supabase),
    ]);
    if (gen.error) throw new Error(gen.error.message);
    const genRows = (gen.data || []) as { id: string; company_id: string | null; job_type: string; provider: string | null; error_message: string | null; created_at: string }[];
    const pubRows = (pub.error ? [] : (pub.data || [])) as { id: string; company_id: string | null; target_platform: string | null; error_message: string | null; created_at: string }[];

    base.numbers = [
      { label: "Failed, 7 days", value: genRows.length + pubRows.length, tone: genRows.length + pubRows.length > 0 ? "warn" : "plain" },
      { label: "Completed, 7 days", value: completed.count ?? 0, tone: "good" },
      { label: "Running now", value: running.count ?? 0 },
    ];

    const plain = (msg: string | null) => (msg || "No reason recorded").replace(/https?:\/\/\S+/g, "").slice(0, 90);
    const rows = [
      ...genRows.map((j) => ({
        at: j.created_at,
        row: {
          id: `gen-${j.id}`,
          title: `${j.job_type.replace(/_/g, " ")} failed`,
          sub: `${(j.company_id && companies.get(j.company_id)?.name) || "Unknown company"} · ${plain(j.error_message)}`,
          href: j.job_type === "weekly_production" ? "/admin/weeks" : "/generate",
          ageLabel: ageLabel(j.created_at, now),
          verbs: [],
        },
      })),
      ...pubRows.map((j) => ({
        at: j.created_at,
        row: {
          id: `pub-${j.id}`,
          title: `Publish to ${j.target_platform || "a network"} failed`,
          sub: `${(j.company_id && companies.get(j.company_id)?.name) || "Unknown company"} · ${plain(j.error_message)}`,
          href: "/publish",
          ageLabel: ageLabel(j.created_at, now),
          verbs: [],
        },
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX_ROWS)
      .map((r) => r.row);

    return { ...base, rows };
  } catch (err) {
    return { ...base, error: `Could not read the jobs: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

/** Tickets: open support tickets, oldest first, with the status change in place. */
export async function loadTickets(supabase: Supabase, now = Date.now()): Promise<Panel> {
  const base: Panel = { key: "tickets", title: "Tickets", numbers: [], rows: [], seeAll: { label: "All tickets", href: "/admin/tickets" } };
  try {
    const since = new Date(now - ONE_WEEK).toISOString();
    const [open, inProgress, resolved, companies] = await Promise.all([
      supabase.from("support_tickets").select("id, company_id, title, priority, reporter_name, status, created_at").in("status", ["open", "investigating"]).order("created_at", { ascending: true }).limit(20),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "resolved").gte("resolved_at", since),
      companyNames(supabase),
    ]);
    if (open.error) throw new Error(open.error.message);
    const rowsIn = (open.data || []) as { id: string; company_id: string | null; title: string; priority: string; reporter_name: string | null; status: string; created_at: string }[];

    base.numbers = [
      { label: "Open", value: rowsIn.length, tone: rowsIn.length > 0 ? "warn" : "plain" },
      { label: "In progress", value: inProgress.count ?? 0 },
      { label: "Resolved, 7 days", value: resolved.count ?? 0, tone: "good" },
    ];

    return {
      ...base,
      rows: rowsIn.slice(0, MAX_ROWS).map((t) => ({
        id: `ticket-${t.id}`,
        title: t.title,
        sub: `${(t.company_id && companies.get(t.company_id)?.name) || t.reporter_name || "No company"} · ${t.priority}`,
        href: "/admin/tickets",
        ageLabel: ageLabel(t.created_at, now),
        verbs: [
          { label: "Start", method: "PATCH" as const, path: "/api/support/tickets", body: { ticketId: t.id, status: "in_progress" }, tone: "primary" as const },
          { label: "Resolve", method: "PATCH" as const, path: "/api/support/tickets", body: { ticketId: t.id, status: "resolved" } },
        ],
      })),
    };
  } catch (err) {
    return { ...base, error: `Could not read the tickets: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

export async function loadAdminPanels(supabase: Supabase, now = Date.now()): Promise<Panel[]> {
  const settled = await Promise.allSettled([loadWaiting(supabase, now), loadClients(supabase, now), loadJobs(supabase, now), loadTickets(supabase, now)]);
  const keys: Panel["key"][] = ["waiting", "clients", "jobs", "tickets"];
  const titles = ["Waiting", "Clients", "Jobs", "Tickets"];
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { key: keys[i], title: titles[i], numbers: [], rows: [], seeAll: { label: "Open", href: "/setup" }, error: "This panel could not load." }
  );
}
