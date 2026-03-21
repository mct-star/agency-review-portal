import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import type { Week, Company, Notification } from "@/types/database";

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

// Stat card component
function StatCard({ value, label, icon, href, color }: { value: number | string; label: string; icon: string; href?: string; color: string }) {
  const iconPaths: Record<string, string> = {
    sparkle: "M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z",
    check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z",
    calendar: "M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm0 6h12v10H6V8Z",
    send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  };

  const content = (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-3xl font-bold" style={{ color }}>{value}</p>
          <p className="mt-1 text-sm text-gray-500">{label}</p>
        </div>
        <div className="rounded-lg p-2" style={{ backgroundColor: color + "15" }}>
          <svg className="h-5 w-5" style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={iconPaths[icon]} />
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

export default async function DashboardPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";
  const companyId = profile.company_id;

  // Fetch company data
  let company: { id: string; name: string; spokesperson_name: string | null; brand_color: string | null; logo_url: string | null; website_url: string | null; overlay_enabled: boolean | null } | null = null;
  if (companyId) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, spokesperson_name, brand_color, logo_url, website_url, overlay_enabled")
      .eq("id", companyId)
      .single();
    company = data;
  } else if (isAdmin) {
    // Admin sees aggregate stats — get first company for setup context
    const { data } = await supabase
      .from("companies")
      .select("id, name, spokesperson_name, brand_color, logo_url, website_url, overlay_enabled")
      .order("name")
      .limit(1)
      .single();
    company = data;
  }

  // Check setup completion for the company
  let setupChecks = {
    companyCreated: false,
    logoUploaded: false,
    spokespersonAdded: false,
    voiceConfigured: false,
    topicsAdded: false,
    socialConnected: false,
    signoffsSet: false,
  };

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
  }

  const setupDone = Object.values(setupChecks).filter(Boolean).length;
  const setupTotal = Object.values(setupChecks).length;

  // Fetch content stats
  let contentQuery = supabase.from("content_pieces").select("approval_status, created_at", { count: "exact" });
  if (!isAdmin && companyId) {
    contentQuery = contentQuery.eq("company_id", companyId);
  }
  const { data: allPieces, count: totalPieces } = await contentQuery;

  const pendingCount = (allPieces || []).filter((p) => p.approval_status === "pending").length;
  const approvedCount = (allPieces || []).filter((p) => p.approval_status === "approved").length;
  const changesCount = (allPieces || []).filter((p) => p.approval_status === "changes_requested").length;

  // Content created this week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const thisWeekCount = (allPieces || []).filter((p) => new Date(p.created_at) >= weekStart).length;

  // Fetch recent weeks
  let weeksQuery = supabase
    .from("weeks")
    .select("*, company:companies(name)")
    .order("year", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(4);
  if (!isAdmin && companyId) {
    weeksQuery = weeksQuery.eq("company_id", companyId);
  }
  const { data: weeks } = await weeksQuery;

  // Fetch unread notifications
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", profile.id)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  const setupHref = company ? `/setup/${company.id}` : "/setup";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? "Dashboard" : `Welcome back, ${profile.full_name || "there"}`}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {company ? company.name : "Your content at a glance"}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/generate/quick"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-600 hover:to-purple-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Quick Generate
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {(notifications || []).length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
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

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard value={totalPieces || 0} label="Total Posts" icon="sparkle" color="#7c3aed" />
        <StatCard value={pendingCount} label="Pending Approval" icon="clock" href="/review" color="#f59e0b" />
        <StatCard value={approvedCount} label="Approved" icon="check" href="/review" color="#10b981" />
        <StatCard value={thisWeekCount} label="Created This Week" icon="calendar" color="#3b82f6" />
      </div>

      {/* Two column layout: Setup + Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Setup Completion */}
        {company && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Setup Progress</h2>
              <Link href={setupHref} className="text-xs text-sky-600 hover:text-sky-700">Manage</Link>
            </div>

            <div className="mt-4 flex justify-center">
              <Gauge
                value={setupDone}
                max={setupTotal}
                label={`${setupDone} of ${setupTotal} complete`}
                color={setupDone === setupTotal ? "#10b981" : "#7c3aed"}
              />
            </div>

            <div className="mt-4 space-y-0.5">
              <SetupItem done={setupChecks.companyCreated} label="Company created" href={setupHref} />
              <SetupItem done={setupChecks.logoUploaded} label="Logo uploaded" href={setupHref} />
              <SetupItem done={setupChecks.spokespersonAdded} label="Spokesperson added" href={`${setupHref}/people`} />
              <SetupItem done={setupChecks.voiceConfigured} label="Voice profile configured" href={`${setupHref}/voice`} />
              <SetupItem done={setupChecks.topicsAdded} label="Topics added" href={`${setupHref}/topics`} />
              <SetupItem done={setupChecks.socialConnected} label="Social accounts connected" href={`${setupHref}/social`} />
              <SetupItem done={setupChecks.signoffsSet} label="Sign-offs configured" href={`${setupHref}/signoffs`} />
            </div>
          </div>
        )}

        {/* Content requiring action + recent weeks */}
        <div className="space-y-6 lg:col-span-2">
          {/* Action needed */}
          {(pendingCount > 0 || changesCount > 0) && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">Needs Your Attention</h2>
              <div className="mt-4 space-y-3">
                {pendingCount > 0 && (
                  <Link href="/review" className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                        <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-amber-800">{pendingCount} post{pendingCount !== 1 ? "s" : ""} waiting for review</span>
                    </div>
                    <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
                {changesCount > 0 && (
                  <Link href="/review" className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 transition-colors hover:bg-red-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                        <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-red-800">{changesCount} post{changesCount !== 1 ? "s" : ""} need changes</span>
                    </div>
                    <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Recent Weeks */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Recent Content Weeks</h2>
              <Link href="/review" className="text-xs text-sky-600 hover:text-sky-700">View all</Link>
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
              <div className="mt-4 space-y-3">
                {(weeks || []).map((week: Week & { company?: { name: string } }) => (
                  <Link
                    key={week.id}
                    href={`/review/${week.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                        <span className="text-sm font-bold text-gray-600">W{week.week_number}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {week.title || `Week ${week.week_number}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {week.date_start} — {week.date_end}
                          {isAdmin && week.company && ` · ${week.company.name}`}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      week.status === "approved" ? "bg-green-100 text-green-700" :
                      week.status === "ready_for_review" ? "bg-amber-100 text-amber-700" :
                      week.status === "changes_requested" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {week.status === "ready_for_review" ? "In review" : week.status === "changes_requested" ? "Changes needed" : week.status?.charAt(0).toUpperCase() + (week.status?.slice(1) || "")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
