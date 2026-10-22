import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ClientHome from "@/components/home/ClientHome";
import HospitalityHome from "@/components/hospitality/HospitalityHome";
import AdminHome from "@/components/home/AdminHome";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { loadAdminPanels } from "@/lib/admin-home/panels";
import { greetingFor, weatherFailedLine, weatherLine, type WeatherSettings } from "@/lib/hospitality/home";
import { todayIn } from "@/lib/hospitality/week";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import SetupReadiness from "@/components/onboarding/SetupReadiness";
import { loadSetupReadiness, type SetupCompany } from "@/lib/onboarding/readiness";
import { loadApprovedUnqueued } from "@/lib/onboarding/home-work";

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

  // Login and the auth callback both land here, including before a workspace exists.
  if (profile && !isAdmin && !companyId) {
    const { data: { user } } = await supabase.auth.getUser();
    return <OnboardingWizard userId={profile.id} userName={profile.full_name || undefined}
      initialCompanyName={typeof user?.user_metadata?.company_name === "string" ? user.user_metadata.company_name : ""}
      initialIndustry={typeof user?.user_metadata?.industry === "string" ? user.user_metadata.industry : ""} />;
  }

  const setupReadiness = !isAdmin && companyId && profile?.company
    ? await loadSetupReadiness(supabase, { ...profile.company, id: companyId } as SetupCompany)
    : null;
  const setupCard = setupReadiness && companyId
    ? <SetupReadiness companyId={companyId} readiness={setupReadiness} hospitality={profile?.company?.post_pack === "hospitality"} />
    : null;

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
      <div>{setupCard}<HospitalityHome
        greeting={greetingFor(firstName, now, company.timezone)}
        pendingPosts={posts.count ?? 0}
        photosWaiting={photos.count ?? 0}
        libraryCount={library.count ?? 0}
        weatherLine={weatherLine(company, now)}
        weatherFailedLine={weatherFailedLine(lastRun.data as { status: string; target_date: string } | null, todayIn(tz, now))}
      /></div>
    );
  }

  // The operator's home: four panels of what is waiting across every client.
  if (isAdmin) {
    const panels = await loadAdminPanels(await createAdminSupabaseClient());
    return <AdminHome greeting={greeting(firstName)} panels={panels} />;
  }

  // ── Fetch counts for smart nudge ──
  let approvedNotPublished: number | null = 0;
  let thisWeekCount = 0;

  // Review units: individual posts (no week) + distinct weeks with pending pieces
  let pendingSingles = 0;
  let pendingWeekCount = 0;
  let pendingWeekLabels: string[] = [];
  let countsUnavailable = false;

  if (companyId || isAdmin) {
    const cid = companyId;

    // Pending review, grouped by creation unit
    {
      let q = supabase.from("content_pieces").select("id, week_id", { count: "exact" }).eq("approval_status", "pending");
      if (!isAdmin && cid) q = q.eq("company_id", cid);
      const { data: pendingPieces, error, count } = await q;
      if (error || count !== (pendingPieces || []).length) countsUnavailable = true;

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
            .eq("company_id", cid)
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

    // Count first publication candidates, never repeat a queued or uncertain attempt.
    approvedNotPublished = cid ? await loadApprovedUnqueued(supabase, cid) : null;
    if (approvedNotPublished === null) countsUnavailable = true;

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
      const { count, error } = await q;
      if (error || count === null) countsUnavailable = true;
      else thisWeekCount = count;
    }

  }

  const totalPendingUnits = pendingSingles + pendingWeekCount;

  // ── Determine the smart nudge ──
  let nudgeText: string;
  let nudgeHref: string;
  let nudgeLabel: string;

  if (countsUnavailable) {
    nudgeText = "Some content counts could not be checked. Open your content to see the latest status.";
    nudgeHref = "/review";
    nudgeLabel = "Open content";
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
  } else if (approvedNotPublished !== null && approvedNotPublished > 0) {
    nudgeText = `${approvedNotPublished} approved post${approvedNotPublished !== 1 ? "s" : ""} not yet queued.`;
    nudgeHref = profile?.can_publish ? "/publish" : "/review";
    nudgeLabel = profile?.can_publish ? "Open publishing" : "View approved content";
  } else if (thisWeekCount === 0) {
    nudgeText = "Start with an idea and turn it into a draft.";
    nudgeHref = "/generate/quick";
    nudgeLabel = "Create a post";
  } else {
    nudgeText = "All caught up. Keep the momentum going.";
    nudgeHref = "/generate/quick";
    nudgeLabel = "Create next post";
  }

  return <div className="space-y-6">{setupCard}<ClientHome
    greeting={greeting(firstName)}
    nudgeText={nudgeText}
    nudgeHref={nudgeHref}
    nudgeLabel={nudgeLabel}
    thisWeekCount={countsUnavailable ? null : thisWeekCount}
    approvedNotPublished={countsUnavailable ? null : approvedNotPublished}
    totalPendingUnits={countsUnavailable ? null : totalPendingUnits}
  /></div>;
}
