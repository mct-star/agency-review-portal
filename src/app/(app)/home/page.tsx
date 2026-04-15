import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ContinueCard from "@/components/home/ContinueCard";

export const metadata: Metadata = {
  title: "Home | AGENCY",
  description: "Your content command centre",
};

function greeting(firstName: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${firstName}.`;
  if (h < 17) return `Good afternoon, ${firstName}.`;
  return `Good evening, ${firstName}.`;
}

export default async function HomePage() {
  const profile = await getUserProfile();
  const supabase = await createServerSupabaseClient();
  const isAdmin = profile?.role === "admin";
  const companyId = profile?.company_id;
  const firstName = (profile?.full_name || "there").split(" ")[0];

  // ── Fetch counts for smart nudge ──
  let approvedNotPublished = 0;
  let thisWeekCount = 0;
  let strategyCompleted = false;

  // Review units: individual posts (no week) + distinct weeks with pending pieces
  let pendingSingles = 0;
  let pendingWeekCount = 0;
  let pendingWeekLabels: string[] = [];

  if (companyId || isAdmin) {
    const cid = companyId;

    // Pending review — grouped by creation unit
    {
      let q = supabase.from("content_pieces").select("id, week_id").eq("approval_status", "pending");
      if (!isAdmin && cid) q = q.eq("company_id", cid);
      const { data: pendingPieces } = await q;

      if (pendingPieces) {
        const singles = pendingPieces.filter(p => !p.week_id);
        pendingSingles = singles.length;

        const weekIds = [...new Set(pendingPieces.filter(p => p.week_id).map(p => p.week_id))];
        pendingWeekCount = weekIds.length;

        // Fetch week labels for the nudge
        if (weekIds.length > 0) {
          const { data: weeks } = await supabase
            .from("weeks")
            .select("date_start")
            .in("id", weekIds)
            .order("date_start", { ascending: true })
            .limit(3);
          pendingWeekLabels = (weeks || []).map(w => {
            const d = new Date(w.date_start + "T00:00:00");
            return `w/c ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
          });
        }
      }
    }

    // Approved but not published
    {
      let q = supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("approval_status", "approved");
      if (!isAdmin && cid) q = q.eq("company_id", cid);
      const { count } = await q;
      approvedNotPublished = count || 0;
    }

    // Posts this week
    {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);

      let q = supabase.from("content_pieces").select("id", { count: "exact", head: true }).gte("created_at", weekStart.toISOString());
      if (!isAdmin && cid) q = q.eq("company_id", cid);
      const { count } = await q;
      thisWeekCount = count || 0;
    }

    // Strategy status
    if (cid) {
      const { data: company } = await supabase.from("companies").select("strategy_completed").eq("id", cid).single();
      strategyCompleted = company?.strategy_completed || false;
    }
  }

  const totalPendingUnits = pendingSingles + pendingWeekCount;

  // ── Determine the smart nudge ──
  let nudgeText: string;
  let nudgeHref: string;
  let nudgeLabel: string;
  let nudgeColor: string; // tailwind classes

  if (!strategyCompleted && !isAdmin) {
    nudgeText = "New here? Build a strategy for best results, or jump straight in.";
    nudgeHref = "/strategy"; // used for left button
    nudgeLabel = ""; // not used — custom two-button layout below
    nudgeColor = "bg-violet-50 text-violet-700 border-violet-200";
  } else if (totalPendingUnits > 0) {
    // Build a human-readable description of what's pending
    const parts: string[] = [];
    if (pendingSingles > 0) parts.push(`${pendingSingles} individual post${pendingSingles !== 1 ? "s" : ""}`);
    if (pendingWeekCount > 0) {
      if (pendingWeekCount <= 2 && pendingWeekLabels.length > 0) {
        parts.push(pendingWeekLabels.join(" and "));
      } else {
        parts.push(`${pendingWeekCount} week${pendingWeekCount !== 1 ? "s" : ""}`);
      }
    }
    nudgeText = `${parts.join(" and ")} awaiting review.`;
    nudgeHref = "/review";
    nudgeLabel = "Review now";
    nudgeColor = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (thisWeekCount === 0) {
    nudgeText = "You haven't posted anything this week yet.";
    nudgeHref = "/generate/quick";
    nudgeLabel = "Create a post";
    nudgeColor = "bg-blue-50 text-blue-700 border-blue-200";
  } else if (approvedNotPublished > 0) {
    nudgeText = `${approvedNotPublished} approved post${approvedNotPublished !== 1 ? "s" : ""} ready to publish.`;
    nudgeHref = "/publish";
    nudgeLabel = "Publish now";
    nudgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else {
    nudgeText = "All caught up. Keep the momentum going.";
    nudgeHref = "/generate/quick";
    nudgeLabel = "Create next post";
    nudgeColor = "bg-gray-50 text-gray-600 border-gray-200";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pt-6 pb-12">
      {/* ===== Greeting ===== */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {greeting(firstName)}
        </h1>
      </div>

      {/* ===== Continue where you left off ===== */}
      <ContinueCard />

      {/* ===== Smart nudge ===== */}
      {!strategyCompleted && !isAdmin ? (
        <div className={`mx-auto max-w-xl rounded-xl border px-5 py-4 ${nudgeColor}`}>
          <p className="text-sm font-medium text-center mb-3">{nudgeText}</p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/strategy"
              className="flex-shrink-0 rounded-lg border border-violet-600 px-4 py-2 text-xs font-semibold text-violet-700 transition-all hover:bg-violet-100"
            >
              Build your content strategy &rarr;
            </Link>
            <Link
              href="/generate/quick"
              className="flex-shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow-md"
            >
              Skip to Quick Generate &rarr;
            </Link>
          </div>
        </div>
      ) : (
        <div className={`mx-auto max-w-xl flex items-center justify-between gap-4 rounded-xl border px-5 py-3.5 ${nudgeColor}`}>
          <p className="text-sm font-medium">{nudgeText}</p>
          <Link
            href={nudgeHref}
            className="flex-shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-semibold shadow-sm transition-all hover:shadow-md"
          >
            {nudgeLabel} &rarr;
          </Link>
        </div>
      )}

      {/* ===== Navigation tiles ===== */}
      <section className="grid gap-5 sm:grid-cols-3" style={{ minHeight: "360px" }}>
        {/* Quick Generate */}
        <Link
          href="/generate/quick"
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-violet-800 p-10 text-white shadow-lg transition-all hover:shadow-2xl hover:scale-[1.01]"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold">Quick Generate</h2>
          <p className="mt-2 text-sm text-violet-200 text-center max-w-xs">
            One post in 30 seconds. Pick a topic, choose a style, publish.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Generate now
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>

        {/* Content Studio */}
        <Link
          href="/generate"
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-10 text-white shadow-lg transition-all hover:shadow-2xl hover:scale-[1.01]"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold">Content Studio</h2>
          <p className="mt-2 text-sm text-amber-100 text-center max-w-xs">
            Plan a full week or month. Strategic ecosystem with linked posts.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Open studio
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>

        {/* Review Content */}
        <Link
          href="/review"
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-10 text-white shadow-lg transition-all hover:shadow-2xl hover:scale-[1.01]"
        >
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {totalPendingUnits > 0 && (
              <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
                {totalPendingUnits > 99 ? "99+" : totalPendingUnits}
              </span>
            )}
          </div>
          <h2 className="mt-6 text-2xl font-bold">Review Content</h2>
          <p className="mt-2 text-sm text-emerald-100 text-center max-w-xs">
            {totalPendingUnits > 0
              ? `${totalPendingUnits} item${totalPendingUnits !== 1 ? "s" : ""} awaiting review.`
              : "Review, approve, and publish your content."}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Review now
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>
      </section>

      {/* ===== This week stats ===== */}
      {(thisWeekCount > 0 || approvedNotPublished > 0 || totalPendingUnits > 0) && (
        <section className="mx-auto max-w-xl">
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-6 py-3">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{thisWeekCount}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Created this week</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600">{approvedNotPublished}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Ready to publish</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-lg font-bold text-amber-600">{totalPendingUnits}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Awaiting review</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== Dashboard link (subtle, for users who want the detailed view) ===== */}
      <div className="text-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-600"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z" />
          </svg>
          View detailed dashboard &rarr;
        </Link>
      </div>
    </div>
  );
}
