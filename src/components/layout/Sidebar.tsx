"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@/types/database";

interface SidebarProps {
  user: User;
  platformLogoUrl?: string | null;
  companyPlan?: string;
  complexity?: string;
}

type PlanTier = "free" | "starter" | "pro" | "agency";
const PLAN_RANK: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

type ComplexityLevel = "beginner" | "intermediate" | "advanced";
const COMPLEXITY_RANK: Record<ComplexityLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  publisherOnly?: boolean;
  highlight?: boolean;
  minPlan?: PlanTier;
  minComplexity?: ComplexityLevel;
}

interface NavSection {
  title: string;
  phase?: number; // 1-4 for journey phases, undefined for non-phase sections
  items: NavItem[];
}

function buildSections(user: User): NavSection[] {
  const isAdmin = user.role === "admin";
  const cid = user.company_id;
  const base = cid ? `/setup/${cid}` : "/setup";

  if (isAdmin) {
    return [
      // Phase 1: Strategise
      {
        title: "Strategise",
        phase: 1,
        items: [
          { href: "/strategy", label: "Strategy Interview", icon: "compass" },
          { href: "/strategy/competitor", label: "Competitor Analysis", icon: "compass" },
        ],
      },
      // Phase 2: Plan
      {
        title: "Plan",
        phase: 2,
        items: [
          { href: "/calendar", label: "Content Calendar", icon: "calendarView" },
          { href: "/plan/weekly", label: "Weekly Planner", icon: "sparkle" },
        ],
      },
      // Phase 3: Create
      {
        title: "Create",
        phase: 3,
        items: [
          { href: "/generate/quick", label: "Quick Post", icon: "zap", highlight: true },
          { href: "/create/voice", label: "Voice to Post", icon: "mic" },
          { href: "/generate", label: "Week Batch", icon: "sparkle" },
          { href: "/create/article", label: "Blog / Article", icon: "quote" },
          { href: "/create/repurpose", label: "Repurpose", icon: "sparkle", minComplexity: "intermediate" as ComplexityLevel },
          { href: "/create/month", label: "Fill Month", icon: "calendarView", minComplexity: "intermediate" as ComplexityLevel },
        ],
      },
      // Phase 4: Review & Publish
      {
        title: "Review & Publish",
        phase: 4,
        items: [
          { href: "/review", label: "Content Review", icon: "checkCircle" },
          { href: "/compliance", label: "Compliance", icon: "shieldCheck" },
          { href: "/publish", label: "Publish", icon: "send" },
          { href: "/analytics", label: "Analytics", icon: "sparkle" },
        ],
      },
      // Settings (non-phase)
      ...(cid
        ? [
            {
              title: "Settings",
              items: [
                { href: "/settings", label: "Brand & People", icon: "building" },
                { href: `${base}/social`, label: "Connections", icon: "link" },
              ] as NavItem[],
            },
          ]
        : []),
      // Admin (non-phase)
      {
        title: "Admin",
        items: [
          { href: "/setup", label: "Companies", icon: "building", adminOnly: true },
          { href: "/admin", label: "Plans & Permissions", icon: "shield", adminOnly: true },
          { href: "/admin/tickets", label: "Support Tickets", icon: "shield", adminOnly: true },
          { href: "/users", label: "Users", icon: "users", adminOnly: true },
        ],
      },
    ];
  }

  // Client sidebar — 4-phase journey
  return [
    // Phase 1: Strategise
    {
      title: "Strategise",
      phase: 1,
      items: [
        { href: "/strategy", label: "Strategy Interview", icon: "compass" },
        { href: "/strategy/competitor", label: "Competitor Analysis", icon: "compass" },
      ],
    },
    // Phase 2: Plan
    {
      title: "Plan",
      phase: 2,
      items: [
        { href: "/calendar", label: "Content Calendar", icon: "calendarView", minPlan: "pro" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
        { href: "/plan/weekly", label: "Weekly Planner", icon: "sparkle", minPlan: "pro" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
      ],
    },
    // Phase 3: Create
    {
      title: "Create",
      phase: 3,
      items: [
        { href: "/generate/quick", label: "Quick Post", icon: "zap", highlight: true },
        { href: "/create/voice", label: "Voice to Post", icon: "mic" },
        { href: "/generate", label: "Week Batch", icon: "sparkle", minPlan: "starter" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
        { href: "/create/article", label: "Blog / Article", icon: "quote", minComplexity: "intermediate" as ComplexityLevel },
        { href: "/create/repurpose", label: "Repurpose", icon: "sparkle", minComplexity: "intermediate" as ComplexityLevel },
        { href: "/create/month", label: "Fill Month", icon: "calendarView", minComplexity: "intermediate" as ComplexityLevel },
      ],
    },
    // Phase 4: Review & Publish
    {
      title: "Review & Publish",
      phase: 4,
      items: [
        { href: "/review", label: "Content Review", icon: "checkCircle" },
        { href: "/compliance", label: "Compliance", icon: "shieldCheck", minPlan: "pro" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
        { href: "/publish", label: "Publish", icon: "send", publisherOnly: true, minPlan: "pro" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
        { href: "/analytics", label: "Analytics", icon: "sparkle", minPlan: "pro" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
      ],
    },
    // Settings (non-phase)
    {
      title: "Settings",
      items: [
        { href: "/settings", label: "Brand & People", icon: "settings" },
        { href: `${base}/social`, label: "Connections", icon: "link", minPlan: "pro" as PlanTier, minComplexity: "intermediate" as ComplexityLevel },
      ],
    },
  ];
}

// ── Phase colours ────────────────────────────────────────────

const PHASE_COLORS: Record<number, { dot: string; active: string; label: string }> = {
  1: { dot: "bg-violet-500", active: "bg-violet-50 text-violet-700", label: "text-violet-600" },
  2: { dot: "bg-blue-500", active: "bg-blue-50 text-blue-700", label: "text-blue-600" },
  3: { dot: "bg-amber-500", active: "bg-amber-50 text-amber-700", label: "text-amber-600" },
  4: { dot: "bg-emerald-500", active: "bg-emerald-50 text-emerald-700", label: "text-emerald-600" },
};

// ── SVG icon paths ───────────────────────────────────────────

const icons: Record<string, string> = {
  grid: "M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z",
  calendar:
    "M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm0 6h12v10H6V8Z",
  building:
    "M4 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3Zm4 3h2v2H8V6Zm6 0h-2v2h2V6ZM8 10h2v2H8v-2Zm6 0h-2v2h2v-2ZM8 14h2v2H8v-2Zm4 0h2v2h-2v-2Z",
  users:
    "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6 8a6 6 0 1 1 12 0A6 6 0 0 1 6 8Zm-2 12a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z",
  sparkle:
    "M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z",
  calendarView:
    "M3 5a2 2 0 0 1 2-2h2V2a1 1 0 1 1 2 0v1h6V2a1 1 0 1 1 2 0v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm16 4H5v10h14V9ZM7 11h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2ZM7 15h2v2H7v-2Zm4 0h2v2h-2v-2Z",
  send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78ZM15.5 7.5l2 2L21 6l-3-3-3.5 3.5 2 2Z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.43-2.56a7.7 7.7 0 0 0 .07-1 7.7 7.7 0 0 0-.07-1l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.4 7.4 0 0 0-1.73-1l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65a7.4 7.4 0 0 0-1.73 1l-2.49-1a.49.49 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64L4.57 11a7.7 7.7 0 0 0-.07 1 7.7 7.7 0 0 0 .07 1l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1a7.4 7.4 0 0 0 1.73 1l.38 2.65A.49.49 0 0 0 10 22h4a.49.49 0 0 0 .49-.42l.38-2.65a7.4 7.4 0 0 0 1.73-1l2.49 1a.49.49 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64Z",
  shield:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  shieldCheck:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  compass: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm3.5-12.5l-5 2-2 5 5-2 2-5Z",
  checkCircle: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  quote: "M6 17h3l2-4V7H5v6h3l-2 4Zm8 0h3l2-4V7h-6v6h3l-2 4Z",
  mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8",
};

export default function Sidebar({ user, platformLogoUrl, companyPlan = "free", complexity = "advanced" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";
  const canPublish = isAdmin || (user.can_publish ?? false);
  const planRank = PLAN_RANK[(companyPlan as PlanTier) || "free"] ?? 0;
  const complexityRank = COMPLEXITY_RANK[(complexity as ComplexityLevel) || "advanced"] ?? 2;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/generate" && pathname.startsWith("/generate/quick")) return false;
    if (pathname.startsWith(href + "/")) return true;
    if (href === "/review" && pathname.startsWith("/content/")) return true;
    if (href === "/compliance" && pathname.startsWith("/compliance/")) return true;
    if (href === "/strategy" && pathname.startsWith("/strategy/")) return true;
    return false;
  }

  const sections = buildSections(user);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="border-b border-gray-200 px-4 py-3">
        {platformLogoUrl ? (
          <div>
            <img
              src={platformLogoUrl}
              alt="Platform"
              className="h-7 max-w-[140px] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <p className="mt-0.5 text-[10px] text-gray-400">Content Platform</p>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-bold text-gray-900">AGENCY</h2>
            <p className="text-[10px] text-gray-400">Content Platform</p>
          </div>
        )}
      </div>

      {/* Home */}
      <div className="px-2 pt-3 pb-1 space-y-0.5">
        <Link
          href="/home"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/home"
              ? "bg-violet-50 text-violet-700"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          Home
        </Link>
      </div>

      {/* Journey phases + settings */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {sections.map((section) => {
          const visibleItems = section.items.filter(
            (item) =>
              (!item.adminOnly || isAdmin) &&
              (!item.publisherOnly || canPublish || item.minPlan) &&
              (isAdmin || !item.minComplexity || complexityRank >= COMPLEXITY_RANK[item.minComplexity])
          );
          if (visibleItems.length === 0) return null;

          const phaseColor = section.phase ? PHASE_COLORS[section.phase] : null;

          return (
            <div key={section.title} className="pt-2">
              <div className="flex items-center gap-2 px-3 pb-1.5">
                {phaseColor && (
                  <div className={`h-1.5 w-1.5 rounded-full ${phaseColor.dot}`} />
                )}
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${
                  phaseColor ? phaseColor.label : "text-gray-400"
                }`}>
                  {section.phase ? `${section.phase}. ${section.title}` : section.title}
                </p>
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href);
                  const locked = !isAdmin && item.minPlan && planRank < (PLAN_RANK[item.minPlan] ?? 0);

                  if (locked) {
                    return (
                      <Link
                        key={item.href}
                        href={`/upgrade?feature=${encodeURIComponent(item.label)}&plan=${item.minPlan || "pro"}`}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-50 hover:text-gray-400 transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d={icons[item.icon]} />
                        </svg>
                        <span className="flex-1">{item.label}</span>
                        <svg className="h-3.5 w-3.5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d={icons.lock} />
                        </svg>
                      </Link>
                    );
                  }

                  const activeClass = phaseColor
                    ? phaseColor.active
                    : "bg-gray-100 text-gray-900";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? activeClass
                          : item.highlight
                          ? "text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={icons[item.icon]} />
                      </svg>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info + plan badge */}
      <div className="border-t border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-gray-900">
            {user.full_name || user.email}
          </p>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
            companyPlan === "agency" ? "bg-purple-100 text-purple-700" :
            companyPlan === "pro" ? "bg-violet-100 text-violet-700" :
            companyPlan === "starter" ? "bg-blue-100 text-blue-700" :
            "bg-gray-100 text-gray-500"
          }`}>
            {(companyPlan || "free").charAt(0).toUpperCase() + (companyPlan || "free").slice(1)}
          </span>
        </div>
        <p className="truncate text-xs text-gray-500">{user.email}</p>
        <button
          onClick={handleSignOut}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
