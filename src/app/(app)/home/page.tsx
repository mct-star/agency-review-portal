import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ClientHome from "@/components/home/ClientHome";
import HospitalityHome from "@/components/hospitality/HospitalityHome";
import AdminHome from "@/components/home/AdminHome";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { loadAdminPanels } from "@/lib/admin-home/panels";
import { greetingFor, weatherFailedLine, weatherLine, type WeatherSettings } from "@/lib/hospitality/home";
import { todayIn } from "@/lib/hospitality/week";

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

  // A hospitality venue gets its own home: what is waiting, three ways to
  // start, and the weather post. The operator (admin) keeps the full home.
  const company = profile?.company as ({ post_pack?: string | null; timezone?: string | null } & WeatherSettings) | null | undefined;
  if (!isAdmin && companyId && company?.post_pack === "hospitality") {
    const [posts, photos, library, lastRun] = await Promise.all([
      supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("approval_status", "pending").eq("content_type", "social_post"),
      supabase.from("photo_inventory").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("photo_inventory").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "approved"),
      supabase.from("weather_post_runs").select("status, target_date").eq("company_id", companyId).order("target_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const now = new Date();
    const tz = company.timezone || "Europe/London";
    return (
      <HospitalityHome
        greeting={greetingFor(firstName, now, company.timezone)}
        pendingPosts={posts.count ?? 0}
        photosWaiting={photos.count ?? 0}
        libraryCount={library.count ?? 0}
        weatherLine={weatherLine(company, now)}
        weatherFailedLine={weatherFailedLine(lastRun.data as { status: string; target_date: string } | null, todayIn(tz, now))}
      />
    );
  }

  // The operator's home: four panels of what is waiting across every client.
  if (isAdmin) {
    const panels = await loadAdminPanels(await createAdminSupabaseClient());
    return <AdminHome greeting={greeting(firstName)} panels={panels} />;
  }

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

    // Pending review, grouped by creation unit
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

  if (!strategyCompleted && !isAdmin) {
    nudgeText = "New here? Build a strategy for best results, or jump straight in.";
    nudgeHref = "/strategy"; // used for left button
    nudgeLabel = ""; // not used: custom two-button layout below
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
  } else if (thisWeekCount === 0) {
    nudgeText = "You haven't posted anything this week yet.";
    nudgeHref = "/generate/quick";
    nudgeLabel = "Create a post";
  } else if (approvedNotPublished > 0) {
    nudgeText = `${approvedNotPublished} approved post${approvedNotPublished !== 1 ? "s" : ""} ready to publish.`;
    nudgeHref = "/publish";
    nudgeLabel = "Publish now";
  } else {
    nudgeText = "All caught up. Keep the momentum going.";
    nudgeHref = "/generate/quick";
    nudgeLabel = "Create next post";
  }

  return <ClientHome
    greeting={greeting(firstName)}
    strategyCompleted={strategyCompleted}
    nudgeText={nudgeText}
    nudgeHref={nudgeHref}
    nudgeLabel={nudgeLabel}
    thisWeekCount={thisWeekCount}
    approvedNotPublished={approvedNotPublished}
    totalPendingUnits={totalPendingUnits}
  />;
}
