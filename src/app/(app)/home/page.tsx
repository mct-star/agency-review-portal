import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

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
  let pendingCount = 0;
  let approvedNotPublished = 0;
  let thisWeekCount = 0;
  let strategyCompleted = false;

  if (companyId || isAdmin) {
    const cid = companyId;

    // Pending review
    {
      let q = supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("approval_status", "pending");
      if (!isAdmin && cid) q = q.eq("company_id", cid);
      const { count } = await q;
      pendingCount = count || 0;
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

  // ── Determine the smart nudge ──
  let nudgeText: string;
  let nudgeHref: string;
  let nudgeLabel: string;
  let nudgeColor: string; // tailwind classes

  if (!strategyCompleted && !isAdmin) {
    nudgeText = "You haven't built your content strategy yet.";
    nudgeHref = "/strategy";
    nudgeLabel = "Start here";
    nudgeColor = "bg-violet-50 text-violet-700 border-violet-200";
  } else if (pendingCount > 0) {
    nudgeText = `${pendingCount} post${pendingCount !== 1 ? "s are" : " is"} waiting for your review.`;
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

      {/* ===== Smart nudge ===== */}
      <div className={`mx-auto max-w-xl flex items-center justify-between gap-4 rounded-xl border px-5 py-3.5 ${nudgeColor}`}>
        <p className="text-sm font-medium">{nudgeText}</p>
        <Link
          href={nudgeHref}
          className="flex-shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-semibold shadow-sm transition-all hover:shadow-md"
        >
          {nudgeLabel} &rarr;
        </Link>
      </div>

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
            {pendingCount > 0 && (
              <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
          <h2 className="mt-6 text-2xl font-bold">Review Content</h2>
          <p className="mt-2 text-sm text-emerald-100 text-center max-w-xs">
            {pendingCount > 0
              ? `${pendingCount} post${pendingCount !== 1 ? "s" : ""} awaiting review.`
              : "Review, approve, and publish your content."}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Review now
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>
      </section>
    </div>
  );
}
