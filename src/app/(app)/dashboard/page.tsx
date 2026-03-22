import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { formatWeekLabel, formatWeekLabelShort } from "@/lib/utils/format-week-label";
import type { Week, Notification, ContentPiece } from "@/types/database";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { getEffectivePlan, getTrialDaysRemaining } from "@/lib/utils/get-effective-plan";
import { getPlanFeatures } from "@/lib/utils/plan-limits";
import type { PlanTier } from "@/types/database";

// Circular progress gauge component
function Gauge({ value, max, label, color, sublabel }: { value: number; max: number; label: string; color: string; sublabel?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-gray-900">{pct}%</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-700">{label}</p>
      {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
    </div>
  );
}

// Stat card component with optional tint background
function StatCard({ value, label, icon, href, color, tintBg }: { value: number | string; label: string; icon: string; href?: string; color: string; tintBg?: string }) {
  const iconPaths: Record<string, string> = {
    sparkle: "M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z",
    check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z",
    calendar: "M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm0 6h12v10H6V8Z",
    send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
    published: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    percent: "M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.5 18.5l13-13",
  };

  const content = (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md" style={tintBg ? { backgroundColor: tintBg } : undefined}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-3xl font-bold" style={{ color }}>{value}</p>
          <p className="mt-1 text-sm text-gray-500">{label}</p>
        </div>
        <div className="rounded-lg p-2" style={{ backgroundColor: color + "15" }}>
          <svg className="h-5 w-5" style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={iconPaths[icon] || iconPaths.sparkle} />
          </svg>
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href} className="block">{content}</Link> : content;
}

// Setup checklist item
function SetupItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-50">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? "bg-green-100" : "border-2 border-gray-300"}`}>
        {done && (
          <svg className="h-3 w-3 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={done ? "text-gray-400 line-through" : "text-gray-700"}>{label}</span>
      {!done && (
        <svg className="ml-auto h-4 w-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5l7 7-7 7" />
        </svg>
      )}
    </Link>
  );
}

// Day names for weekly view
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Status color mapping for weekly content pills
function statusColor(status: string): string {
  switch (status) {
    case "approved": return "bg-green-400";
    case "pending": return "bg-amber-400";
    case "changes_requested": return "bg-red-400";
    case "published": return "bg-blue-400";
    default: return "bg-gray-300";
  }
}

function statusBorder(status: string): string {
  switch (status) {
    case "approved": return "border-green-200 bg-green-50";
    case "pending": return "border-amber-200 bg-amber-50";
    case "changes_requested": return "border-red-200 bg-red-50";
    case "published": return "border-blue-200 bg-blue-50";
    default: return "border-gray-200 bg-gray-50";
  }
}

export default async function DashboardPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";
  const companyId = profile.company_id;

  // Show onboarding wizard for new users with no company
  if (!companyId && !isAdmin) {
    return (
      <OnboardingWizard
        userId={profile.id}
        userName={profile.full_name || undefined}
      />
    );
  }

  // Fetch company data
  let company: { id: string; name: string; spokesperson_name: string | null; brand_color: string | null; logo_url: string | null; website_url: string | null; overlay_enabled: boolean | null; plan: string | null; trial_plan: string | null; trial_expires_at: string | null } | null = null;
  if (companyId) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, spokesperson_name, brand_color, logo_url, website_url, overlay_enabled, plan, trial_plan, trial_expires_at")
      .eq("id", companyId)
      .single();
    company = data;
  } else if (isAdmin) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, spokesperson_name, brand_color, logo_url, website_url, overlay_enabled, plan, trial_plan, trial_expires_at")
      .order("name")
      .limit(1)
      .single();
    company = data;
  }

  // Check setup completion for the company
  const setupSteps: { key: string; label: string; done: boolean; href: string }[] = [];
  let setupChecks = {
    companyCreated: false,
    logoUploaded: false,
    spokespersonAdded: false,
    voiceConfigured: false,
    topicsAdded: false,
    socialConnected: false,
    signoffsSet: false,
  };

  const setupHref = company ? `/setup/${company.id}` : "/setup";

  if (company) {
    setupChecks.companyCreated = true;
    setupChecks.logoUploaded = !!company.logo_url;

    const { count: spokesCount } = await supabase
      .from("company_spokespersons")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("is_active", true);
    setupChecks.spokespersonAdded = (spokesCount || 0) > 0;

    const { data: voice } = await supabase
      .from("company_voice_profiles")
      .select("id")
      .eq("company_id", company.id)
      .limit(1)
      .single();
    setupChecks.voiceConfigured = !!voice;

    const { count: topicCount } = await supabase
      .from("company_topics")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);
    setupChecks.topicsAdded = (topicCount || 0) > 0;

    const { count: socialCount } = await supabase
      .from("company_social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);
    setupChecks.socialConnected = (socialCount || 0) > 0;

    const { data: signoffs } = await supabase
      .from("company_signoffs")
      .select("id")
      .eq("company_id", company.id)
      .limit(1)
      .single();
    setupChecks.signoffsSet = !!signoffs;

    // Build ordered steps for next-step CTA
    setupSteps.push(
      { key: "companyCreated", label: "Company created", done: setupChecks.companyCreated, href: setupHref },
      { key: "logoUploaded", label: "Logo uploaded", done: setupChecks.logoUploaded, href: setupHref },
      { key: "spokespersonAdded", label: "Spokesperson added", done: setupChecks.spokespersonAdded, href: `${setupHref}/people` },
      { key: "voiceConfigured", label: "Voice profile configured", done: setupChecks.voiceConfigured, href: `${setupHref}/voice` },
      { key: "topicsAdded", label: "Topics added", done: setupChecks.topicsAdded, href: `${setupHref}/topics` },
      { key: "socialConnected", label: "Social accounts connected", done: setupChecks.socialConnected, href: `${setupHref}/social` },
      { key: "signoffsSet", label: "Sign-offs configured", done: setupChecks.signoffsSet, href: `${setupHref}/signoffs` },
    );
  }

  const setupDone = Object.values(setupChecks).filter(Boolean).length;
  const setupTotal = Object.values(setupChecks).length;
  const setupComplete = setupDone === setupTotal;
  const nextStep = setupSteps.find(s => !s.done);

  // Fetch content stats (include title for action cards)
  let contentQuery = supabase.from("content_pieces").select("id, title, approval_status, created_at, day_of_week, week_id", { count: "exact" });
  if (!isAdmin && companyId) {
    contentQuery = contentQuery.eq("company_id", companyId);
  }
  const { data: allPieces, count: totalPieces } = await contentQuery;

  const pendingPieces = (allPieces || []).filter((p) => p.approval_status === "pending");
  const pendingCount = pendingPieces.length;
  const approvedCount = (allPieces || []).filter((p) => p.approval_status === "approved").length;
  const changesRequested = (allPieces || []).filter((p) => p.approval_status === "changes_requested");
  const changesCount = changesRequested.length;

  // Published count — check for publishing_jobs with status = 'published'
  let publishedCount = 0;
  {
    let pubQuery = supabase.from("publishing_jobs").select("id", { count: "exact", head: true }).eq("status", "published");
    if (!isAdmin && companyId) {
      pubQuery = pubQuery.eq("company_id", companyId);
    }
    const { count } = await pubQuery;
    publishedCount = count || 0;
  }

  // Content created this week (Monday-based week start for UK)
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const thisWeekCount = (allPieces || []).filter((p) => new Date(p.created_at) >= weekStart).length;

  // Schedule compliance — count posting slots vs pieces this week
  let scheduleCompliance: number | null = null;
  let hasSchedule = false;
  if (company) {
    const { count: slotCount } = await supabase
      .from("posting_slots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("is_active", true);

    if (slotCount && slotCount > 0) {
      hasSchedule = true;
      scheduleCompliance = slotCount > 0 ? Math.min(100, Math.round((thisWeekCount / slotCount) * 100)) : 0;
    }
  }

  // Fetch recent weeks with piece counts
  let weeksQuery = supabase
    .from("weeks")
    .select("*, company:companies(name), content_pieces(id, approval_status)")
    .order("year", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(6);
  if (!isAdmin && companyId) {
    weeksQuery = weeksQuery.eq("company_id", companyId);
  }
  const { data: weeks } = await weeksQuery;

  // Current week's content grouped by day for the weekly view
  // Find the current week record (if any)
  const currentWeekStart = new Date(weekStart);
  const currentWeekStartStr = currentWeekStart.toISOString().split("T")[0];
  const currentWeekEnd = new Date(weekStart);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
  const currentWeekEndStr = currentWeekEnd.toISOString().split("T")[0];

  let currentWeekPieces: { id: string; title: string; approval_status: string; day_of_week: string | null; week_id: string }[] = [];
  let currentWeekId: string | null = null;
  {
    let cwQuery = supabase
      .from("weeks")
      .select("id")
      .gte("date_start", currentWeekStartStr)
      .lte("date_start", currentWeekEndStr);
    if (!isAdmin && companyId) {
      cwQuery = cwQuery.eq("company_id", companyId);
    }
    const { data: currentWeeks } = await cwQuery.limit(1);
    if (currentWeeks && currentWeeks.length > 0) {
      currentWeekId = currentWeeks[0].id;
      let piecesQuery = supabase
        .from("content_pieces")
        .select("id, title, approval_status, day_of_week, week_id")
        .eq("week_id", currentWeekId)
        .order("sort_order");
      const { data: cwPieces } = await piecesQuery;
      currentWeekPieces = cwPieces || [];
    }
  }

  // Group current week pieces by day
  const dayMap: Record<string, typeof currentWeekPieces> = {};
  for (const dayName of DAY_NAMES) {
    dayMap[dayName] = [];
  }
  // Map day_of_week values to our day names
  const dayMapping: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
    fri: "Fri", sat: "Sat", sun: "Sun",
    Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
    Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
  };
  for (const piece of currentWeekPieces) {
    const mapped = piece.day_of_week ? dayMapping[piece.day_of_week] || piece.day_of_week : null;
    if (mapped && dayMap[mapped]) {
      dayMap[mapped].push(piece);
    }
  }

  // Fetch unread notifications
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", profile.id)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  // Format today's date nicely
  const todayFormatted = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const brandColor = company?.brand_color || "#7c3aed";

  // Plan & trial info
  const effectivePlan = company ? getEffectivePlan({
    plan: (company.plan || "starter") as PlanTier,
    trial_plan: company.trial_plan as PlanTier | null,
    trial_expires_at: company.trial_expires_at,
  }) : "starter";
  const planFeatures = getPlanFeatures(effectivePlan);
  const trialDaysLeft = company ? getTrialDaysRemaining({
    trial_expires_at: company.trial_expires_at,
  }) : null;
  const isOnTrial = trialDaysLeft !== null && trialDaysLeft > 0;
  const monthPostsUsed = thisWeekCount; // Approximation — could be more precise
  const postLimit = planFeatures.postsPerMonth;

  return (
    <div className="space-y-6">
      {/* ===== 1. Welcome + Tagline ===== */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {company?.logo_url && (
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-10 w-10 rounded-xl object-contain"
              />
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {isAdmin ? "Dashboard" : `Welcome back, ${(profile.full_name || "there").split(" ")[0]}`}
              </h1>
              <p className="text-xs text-gray-400">{todayFormatted}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isOnTrial && trialDaysLeft !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                Pro Trial {trialDaysLeft}d left
              </span>
            )}
            {company && (
              <Link
                href={`/setup/${company.id}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Settings
              </Link>
            )}
          </div>
        </div>
        {/* Tagline */}
        <div className="mt-4 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4">
          <p className="text-sm font-semibold text-white tracking-wide">
            Your weekly demand ecosystem, deployed in minutes.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            47,000 lines. 39 quality gates. One voice. Your voice.
          </p>
        </div>
      </div>

      {/* ===== 2. Three Big Action Cards ===== */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Quick Generate */}
        <Link
          href="/generate/quick"
          className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:border-violet-300"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-bold text-gray-900">Quick Generate</h3>
          <p className="mt-1 text-xs text-gray-500">One post in 30 seconds. Pick a topic, choose a style, publish.</p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 group-hover:gap-2 transition-all">
            Generate now
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>

        {/* Content Studio */}
        <Link
          href="/generate/studio"
          className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:border-amber-300"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 transition-colors group-hover:bg-amber-600 group-hover:text-white">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-bold text-gray-900">Content Studio</h3>
          <p className="mt-1 text-xs text-gray-500">Plan a full week or month. Strategic ecosystem with linked posts.</p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 group-hover:gap-2 transition-all">
            Open studio
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>

        {/* Review Content */}
        <Link
          href="/content"
          className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:border-emerald-300"
        >
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
          <h3 className="mt-4 text-base font-bold text-gray-900">Review Content</h3>
          <p className="mt-1 text-xs text-gray-500">
            {pendingCount > 0
              ? `${pendingCount} post${pendingCount !== 1 ? "s" : ""} awaiting review. Approve and publish.`
              : "Review, approve, and publish your content."}
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 group-hover:gap-2 transition-all">
            Review now
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>
      </div>

      {/* ===== 3. Quick Actions Bar ===== */}
      <div className="flex flex-wrap gap-2">
        {company && pendingCount > 0 && (
          <Link
            href="/content?status=pending"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {pendingCount} awaiting review
          </Link>
        )}
        {company && changesCount > 0 && (
          <Link
            href="/content?status=changes_requested"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01" /></svg>
            {changesCount} need changes
          </Link>
        )}
        <Link
          href="/compliance"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          Compliance
        </Link>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Calendar
        </Link>
        {company && (
          <Link
            href={`/setup/${company.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>
          Setup
          </Link>
        )}
      </div>

      {/* ===== 4. Activity Strip (compact stats) ===== */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-gray-100 sm:grid-cols-4 lg:grid-cols-6">
          <div className="px-4 py-3">
            <p className="text-2xl font-bold text-gray-900">{totalPieces || 0}</p>
            <p className="text-[11px] text-gray-400">Total Posts</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xl font-bold" style={{ color: pendingCount > 0 ? "#f59e0b" : "#9ca3af" }}>{pendingCount}</p>
            <p className="text-[11px] text-gray-400">Pending Review</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
            <p className="text-[11px] text-gray-400">Approved</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xl font-bold text-blue-600">{publishedCount}</p>
            <p className="text-[11px] text-gray-400">Published</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-2xl font-bold text-violet-600">{thisWeekCount}</p>
            <p className="text-[11px] text-gray-400">This Week</p>
          </div>
          <div className="px-4 py-3">
            {hasSchedule ? (
              <>
                <p className="text-2xl font-bold" style={{ color: scheduleCompliance !== null && scheduleCompliance >= 80 ? "#10b981" : "#f59e0b" }}>{scheduleCompliance}%</p>
                <p className="text-[11px] text-gray-400">Schedule Hit</p>
              </>
            ) : (
              <Link href={company ? `${setupHref}/schedule` : "/setup"} className="block">
                <p className="text-sm font-medium text-gray-300">--</p>
                <p className="text-[11px] text-sky-500">Set schedule</p>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Old trial/plan banners removed — info now in welcome section */}

      {/* ===== 2. Setup Progress (only if incomplete) ===== */}
      {company && !setupComplete && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Setup Progress</h2>
            <Link href={setupHref} className="text-xs font-medium text-sky-600 hover:text-sky-700">
              Manage setup
            </Link>
          </div>

          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* Gauge */}
            <div className="shrink-0">
              <Gauge
                value={setupDone}
                max={setupTotal}
                label={`${setupDone} of ${setupTotal} complete`}
                color={brandColor}
              />
            </div>

            {/* Next step CTA + checklist */}
            <div className="flex-1">
              {nextStep && (
                <Link
                  href={nextStep.href}
                  className="mb-4 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-gray-50"
                  style={{ borderColor: brandColor + "40", backgroundColor: brandColor + "08" }}
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Next step</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900">{nextStep.label}</p>
                  </div>
                  <span className="text-sm font-medium" style={{ color: brandColor }}>
                    Complete now &rarr;
                  </span>
                </Link>
              )}
              <div className="space-y-0.5">
                {setupSteps.map((step) => (
                  <SetupItem key={step.key} done={step.done} label={step.label} href={step.href} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Notifications (if any) ===== */}
      {(notifications || []).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h2 className="text-sm font-semibold text-amber-800">
              {notifications!.length} unread notification{notifications!.length !== 1 ? "s" : ""}
            </h2>
          </div>
          <ul className="mt-2 space-y-1">
            {notifications!.slice(0, 3).map((n: Notification) => (
              <li key={n.id} className="text-sm text-amber-700">{n.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Old 6-card stats grid replaced by compact activity strip above */}

      {/* ===== 4. What Needs Attention ===== */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">What Needs Attention</h2>

        {pendingCount === 0 && changesCount === 0 && setupComplete ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-green-50 px-4 py-4">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-sm font-semibold text-green-800">All caught up!</p>
              <p className="text-xs text-green-600">No posts need your attention right now.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Posts awaiting review */}
            {pendingCount > 0 && (
              <Link href="/review" className="rounded-lg border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                    <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-amber-800">{pendingCount} awaiting review</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {pendingPieces.slice(0, 3).map((p) => (
                    <li key={p.id} className="truncate text-xs text-amber-700">{p.title}</li>
                  ))}
                  {pendingCount > 3 && (
                    <li className="text-xs font-medium text-amber-600">+{pendingCount - 3} more</li>
                  )}
                </ul>
                <p className="mt-3 text-xs font-medium text-amber-700">Review now &rarr;</p>
              </Link>
            )}

            {/* Posts with changes requested */}
            {changesCount > 0 && (
              <Link href="/review" className="rounded-lg border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                    <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-red-800">{changesCount} need changes</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {changesRequested.slice(0, 3).map((p) => (
                    <li key={p.id} className="truncate text-xs text-red-700">{p.title}</li>
                  ))}
                  {changesCount > 3 && (
                    <li className="text-xs font-medium text-red-600">+{changesCount - 3} more</li>
                  )}
                </ul>
                <p className="mt-3 text-xs font-medium text-red-700">View changes &rarr;</p>
              </Link>
            )}

            {/* Missing setup items */}
            {!setupComplete && nextStep && (
              <Link href={nextStep.href} className="rounded-lg border border-gray-200 bg-gray-50 p-4 transition-colors hover:bg-gray-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                    <svg className="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">Setup incomplete</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{setupTotal - setupDone} step{setupTotal - setupDone !== 1 ? "s" : ""} remaining</p>
                <p className="mt-3 text-xs font-medium text-sky-600">{nextStep.label} &rarr;</p>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ===== 5. This Week's Content (day-by-day view) ===== */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">This Week&apos;s Content</h2>
          {currentWeekId && (
            <Link href={`/review/${currentWeekId}`} className="text-xs font-medium text-sky-600 hover:text-sky-700">
              View full week
            </Link>
          )}
        </div>

        {currentWeekPieces.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <svg className="mx-auto h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm0 6h12v10H6V8Z" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">No content generated this week</p>
            <Link
              href="/generate/quick"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              Generate now
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-7 gap-2">
            {DAY_NAMES.map((day, idx) => {
              const pieces = dayMap[day];
              const isToday = idx === ((now.getDay() + 6) % 7); // Adjust for Mon=0
              return (
                <div key={day} className="min-h-[80px]">
                  <p className={`mb-2 text-center text-xs font-semibold uppercase tracking-wide ${isToday ? "text-gray-900" : "text-gray-400"}`}>
                    {day}
                    {isToday && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: brandColor }} />}
                  </p>
                  <div className="space-y-1.5">
                    {pieces.length === 0 ? (
                      <div className="h-2 rounded-full bg-gray-100" />
                    ) : (
                      pieces.map((piece) => (
                        <Link
                          key={piece.id}
                          href={`/content/${piece.id}`}
                          className={`block rounded-md border px-2 py-1.5 transition-colors hover:opacity-80 ${statusBorder(piece.approval_status)}`}
                          title={piece.title}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusColor(piece.approval_status)}`} />
                            <span className="truncate text-[10px] font-medium text-gray-700">{piece.title}</span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        {currentWeekPieces.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-300" /> Not generated
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Pending review
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Approved
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> Published
            </div>
          </div>
        )}
      </div>

      {/* ===== 6. Recent Weeks (horizontal cards) ===== */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Weeks</h2>
          <Link href="/review" className="text-xs font-medium text-sky-600 hover:text-sky-700">View all</Link>
        </div>

        {(weeks || []).length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-500">No content weeks yet.</p>
            <Link
              href="/generate"
              className="mt-2 inline-block text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              Generate your first content
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(weeks || []).map((week: Week & { company?: { name: string }; content_pieces?: { id: string; approval_status: string }[] }) => {
              const pieces = week.content_pieces || [];
              const weekApproved = pieces.filter(p => p.approval_status === "approved").length;
              const weekTotal = pieces.length;
              const progressPct = weekTotal > 0 ? Math.round((weekApproved / weekTotal) * 100) : 0;

              return (
                <Link
                  key={week.id}
                  href={`/review/${week.id}`}
                  className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-600 group-hover:bg-gray-200">
                        {formatWeekLabelShort(week.date_start, week.week_number)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {week.title || formatWeekLabel(week.date_start, week.week_number)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {week.subject || (week.theme ? `Theme: ${week.theme}` : `${week.date_start} - ${week.date_end}`)}
                          {isAdmin && week.company && ` · ${week.company.name}`}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      week.status === "approved" ? "bg-green-100 text-green-700" :
                      week.status === "ready_for_review" ? "bg-amber-100 text-amber-700" :
                      week.status === "changes_requested" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {week.status === "ready_for_review" ? "In review" : week.status === "changes_requested" ? "Changes needed" : week.status?.charAt(0).toUpperCase() + (week.status?.slice(1) || "")}
                    </span>
                  </div>

                  {/* Approval progress bar */}
                  {weekTotal > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{weekApproved}/{weekTotal} approved</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-green-400 transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
