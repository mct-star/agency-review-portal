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
}

type PlanTier = "free" | "starter" | "pro" | "agency";
const PLAN_RANK: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  publisherOnly?: boolean;
  highlight?: boolean;
  minPlan?: PlanTier;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function buildSections(user: User): NavSection[] {
  const isAdmin = user.role === "admin";
  const cid = user.company_id;

  if (isAdmin) {
    return [
      // Admin's own company setup (if they have one)
      ...(cid
        ? [
            {
              title: "Setup",
              items: [
                { href: `/setup/${cid}`, label: "My Brand", icon: "building" },
              ],
            },
          ]
        : []),
      {
        title: "Create",
        items: [
          { href: "/generate/quick", label: "Quick Generate", icon: "zap", highlight: true },
          { href: "/generate", label: "Content Studio", icon: "sparkle" },
        ],
      },
      {
        title: "Review",
        items: [
          { href: "/review", label: "Content", icon: "calendar" },
        ],
      },
      {
        title: "Compliance",
        items: [
          { href: "/compliance", label: "Regulatory Review", icon: "shieldCheck", minPlan: "pro" as PlanTier },
        ],
      },
      {
        title: "Plan",
        items: [
          { href: "/calendar", label: "Calendar", icon: "calendarView" },
        ],
      },
      {
        title: "Publish",
        items: [
          { href: "/publish", label: "Post", icon: "send" },
        ],
      },
      {
        title: "Admin",
        items: [
          { href: "/setup", label: "Companies", icon: "building", adminOnly: true },
          { href: "/admin", label: "Plans & Permissions", icon: "shield", adminOnly: true },
          { href: "/users", label: "Users", icon: "users", adminOnly: true },
        ],
      },
    ];
  }

  // Client sidebar — expanded with sub-pages and plan gating
  const base = cid ? `/setup/${cid}` : "/setup";

  return [
    {
      title: "Setup",
      items: [
        { href: "/setup/content", label: "Content Setup", icon: "settings" },
      ],
    },
    {
      title: "Connect",
      items: [
        { href: `${base}/social`, label: "Social Accounts", icon: "link", minPlan: "pro" as PlanTier },
        { href: `${base}/api-keys`, label: "API Keys", icon: "key", minPlan: "agency" as PlanTier },
      ],
    },
    {
      title: "Create",
      items: [
        { href: "/generate/quick", label: "Quick Generate", icon: "zap", highlight: true },
        { href: "/generate", label: "Content Studio", icon: "sparkle", minPlan: "starter" as PlanTier },
      ],
    },
    {
      title: "Review",
      items: [
        { href: "/review", label: "Content", icon: "calendar" },
      ],
    },
    {
      title: "Compliance",
      items: [
        { href: "/compliance", label: "Regulatory Review", icon: "shieldCheck", minPlan: "pro" as PlanTier },
      ],
    },
    {
      title: "Plan",
      items: [
        { href: "/calendar", label: "Calendar", icon: "calendarView", minPlan: "pro" as PlanTier },
      ],
    },
    {
      title: "Publish",
      items: [
        { href: "/publish", label: "Post", icon: "send", publisherOnly: true, minPlan: "agency" as PlanTier },
      ],
    },
  ];
}

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
  mic: "M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Zm-1 18.93A7.01 7.01 0 0 1 5 13h2a5 5 0 0 0 10 0h2a7.01 7.01 0 0 1-6 6.93V22h4v2H7v-2h4v-2.07Z",
  lightbulb: "M12 2a7 7 0 0 0-4 12.72V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.28A7 7 0 0 0 12 2ZM9 20h6v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1Z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10a1 1 0 0 1-.3.7l-3 3-1.4-1.4L11 11.58V6h2v6Z",
  quote: "M6 17h3l2-4V7H5v6h3l-2 4Zm8 0h3l2-4V7h-6v6h3l-2 4Z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78ZM15.5 7.5l2 2L21 6l-3-3-3.5 3.5 2 2Z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.43-2.56a7.7 7.7 0 0 0 .07-1 7.7 7.7 0 0 0-.07-1l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.4 7.4 0 0 0-1.73-1l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65a7.4 7.4 0 0 0-1.73 1l-2.49-1a.49.49 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64L4.57 11a7.7 7.7 0 0 0-.07 1 7.7 7.7 0 0 0 .07 1l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1a7.4 7.4 0 0 0 1.73 1l.38 2.65A.49.49 0 0 0 10 22h4a.49.49 0 0 0 .49-.42l.38-2.65a7.4 7.4 0 0 0 1.73-1l2.49 1a.49.49 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64Z",
  shield:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  shieldCheck:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
};

export default function Sidebar({ user, platformLogoUrl, companyPlan = "free" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";
  const canPublish = isAdmin || (user.can_publish ?? false);
  const planRank = PLAN_RANK[(companyPlan as PlanTier) || "free"] ?? 0;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    // /generate should NOT match /generate/quick (they're separate menu items)
    if (href === "/generate" && pathname.startsWith("/generate/quick")) return false;
    if (pathname.startsWith(href + "/")) return true;
    if (href === "/review" && pathname.startsWith("/content/")) return true;
    if (href === "/compliance" && pathname.startsWith("/compliance/")) return true;
    return false;
  }

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
            <h2 className="text-sm font-bold text-gray-900">Copy Magic</h2>
            <p className="text-[10px] text-gray-400">Content Platform</p>
          </div>
        )}
      </div>

      {/* Dashboard link */}
      <div className="px-2 pt-3 pb-1">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard"
              ? "bg-sky-50 text-sky-700"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d={icons.grid} />
          </svg>
          Dashboard
        </Link>
      </div>

      {/* Sections */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {buildSections(user).map((section) => {
          const visibleItems = section.items.filter(
            (item) => (!item.adminOnly || isAdmin) && (!item.publisherOnly || canPublish || item.minPlan)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href);
                  // Admins bypass plan locks
                  const locked = !isAdmin && item.minPlan && planRank < (PLAN_RANK[item.minPlan] ?? 0);

                  if (locked) {
                    return (
                      <div
                        key={item.href}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 cursor-not-allowed"
                        title={`Requires ${item.minPlan} plan or higher`}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d={icons[item.icon]} />
                        </svg>
                        <span className="flex-1">{item.label}</span>
                        <svg className="h-3.5 w-3.5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d={icons.lock} />
                        </svg>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-sky-50 text-sky-700"
                          : item.highlight
                          ? "text-sky-600 hover:bg-sky-50 hover:text-sky-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
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
