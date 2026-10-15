/**
 * The one navigation map. The sidebar draws these menus and nav.test.ts
 * checks them against the pages on disk: every menu href must be a real
 * page, and every page under (app) must be either in a menu or listed in
 * DETAIL_PAGES. Add a page here, not in the Sidebar component.
 */
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import { FEATURE_PLANS } from "@/lib/plan-features";
import type { User } from "@/types/database";

export type PlanTier = "free" | "starter" | "pro" | "agency";
export const PLAN_RANK: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

export type ComplexityLevel = "beginner" | "intermediate" | "advanced";
export const COMPLEXITY_RANK: Record<ComplexityLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** The Home link the sidebar shows above every menu. */
export const HOME_HREF = "/home";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  publisherOnly?: boolean;
  highlight?: boolean;
  minPlan?: PlanTier;
  minComplexity?: ComplexityLevel;
}

export interface NavSection {
  title: string;
  phase?: number; // 1-4 for journey phases, undefined for non-phase sections
  items: NavItem[];
}

export interface NavOptions {
  /** Include the Week Board pages. Defaults to the NEXT_PUBLIC_WEEK_BOARD_ENABLED flag. */
  weekBoard?: boolean;
}

function settingsBase(user: User): string {
  return user.company_id ? `/setup/${user.company_id}` : "/setup";
}

/**
 * The menu for a hospitality company's own people: what needs doing today,
 * writing, the photo library, the week and its export, and the venue settings.
 * No strategy interview or compliance: those are for the business-to-business pack.
 */
export function hospitalitySections(user: User): NavSection[] {
  const base = settingsBase(user);
  return [
    {
      title: "Today",
      items: [
        { href: "/approvals", label: "Waiting for you", icon: "checkCircle", highlight: true },
        { href: "/generate/quick", label: "Write a post", icon: "zap" },
        { href: "/create/week-interview", label: "Talk through the week", icon: "mic" },
        { href: "/notifications", label: "Notifications", icon: "calendar" },
      ],
    },
    {
      title: "Photos",
      items: [{ href: "/library", label: "Photo & Video Library", icon: "video" }],
    },
    {
      title: "The week",
      items: [
        { href: "/coming-up", label: "Coming up", icon: "calendarView" },
        { href: "/calendar", label: "Calendar", icon: "calendarView" },
        { href: "/review", label: "This week", icon: "send" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: `${base}/hospitality`, label: "Venue and posting", icon: "building" },
        { href: `${base}/hospitality#brand`, label: "Brand", icon: "settings" },
      ],
    },
  ];
}

/** The menu for AGENCY staff (users.role = admin). */
export function adminSections(user: User, opts: NavOptions = {}): NavSection[] {
  const cid = user.company_id;
  const base = settingsBase(user);
  const weekBoard = opts.weekBoard ?? isWeekBoardEnabled();
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
        ...(weekBoard
          ? ([
              { href: "/admin/calendar", label: "Source Calendar", icon: "calendarView", adminOnly: true },
              { href: "/admin/plan/weekly", label: "Slot Planner", icon: "sparkle", adminOnly: true },
            ] as NavItem[])
          : []),
      ],
    },
    // Phase 3: Create
    {
      title: "Create",
      phase: 3,
      items: [
        ...(weekBoard
          ? ([
              { href: "/admin/weeks", label: "Week Board", icon: "grid", adminOnly: true, highlight: true },
              { href: "/admin/clips", label: "Clips", icon: "video", adminOnly: true },
            ] as NavItem[])
          : []),
        { href: "/admin/bank", label: "Photo & Video Bank", icon: "video", adminOnly: true },
        { href: "/generate/quick", label: "Quick Post", icon: "zap", highlight: true },
        { href: "/create/voice", label: "Voice to Post", icon: "mic" },
        { href: "/generate", label: "Week Batch", icon: "sparkle" },
        { href: "/create/article", label: "Blog / Article", icon: "quote" },
        { href: "/create/repurpose", label: "Repurpose", icon: "sparkle", minComplexity: "intermediate" },
        { href: "/create/month", label: "Fill Month", icon: "calendarView", minComplexity: "intermediate" },
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

/** The menu for a business-to-business client's own people: the 4-phase journey. */
export function clientSections(user: User): NavSection[] {
  const base = settingsBase(user);
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
        { href: "/calendar", label: "Content Calendar", icon: "calendarView", minPlan: FEATURE_PLANS.calendar, minComplexity: "intermediate" },
        { href: "/plan/weekly", label: "Weekly Planner", icon: "sparkle", minPlan: FEATURE_PLANS.weeklyPlanner, minComplexity: "intermediate" },
      ],
    },
    // Phase 3: Create
    {
      title: "Create",
      phase: 3,
      items: [
        { href: "/generate/quick", label: "Quick Post", icon: "zap", highlight: true },
        { href: "/create/voice", label: "Voice to Post", icon: "mic" },
        { href: "/library", label: "Photo & Video Library", icon: "video" },
        // Week Batch, Blog / Article, Repurpose and Fill Month stay off the
        // client menu until their routes are safe for a client to call.
      ],
    },
    // Phase 4: Review & Publish
    {
      title: "Review & Publish",
      phase: 4,
      items: [
        { href: "/review", label: "Content Review", icon: "checkCircle" },
        { href: "/compliance", label: "Compliance", icon: "shieldCheck", minPlan: FEATURE_PLANS.compliance, minComplexity: "intermediate" },
        // Shown only to someone with the publish right whose plan includes it.
        { href: "/publish", label: "Publish", icon: "send", publisherOnly: true, minPlan: FEATURE_PLANS.publish, minComplexity: "intermediate" },
        { href: "/analytics", label: "Analytics", icon: "sparkle", minPlan: FEATURE_PLANS.analytics, minComplexity: "intermediate" },
      ],
    },
    // Settings (non-phase)
    {
      title: "Settings",
      items: [
        { href: "/settings", label: "Brand & People", icon: "settings" },
        { href: `${base}/social`, label: "Connections", icon: "link", minPlan: FEATURE_PLANS.connections, minComplexity: "intermediate" },
      ],
    },
  ];
}

/** Picks the menu: admins get the admin menu, hospitality clients the short one, everyone else the client journey. */
export function sectionsFor(user: User, postPack?: string, opts: NavOptions = {}): NavSection[] {
  if (user.role === "admin") return adminSections(user, opts);
  if (postPack === "hospitality") return hospitalitySections(user);
  return clientSections(user);
}

/**
 * Pages reached from a parent page, not from a menu. Patterns use the
 * folder names, so `[param]` stands for a dynamic segment. A trailing
 * `/*` covers every page below that prefix.
 */
export const DETAIL_PAGES: string[] = [
  "/content/[pieceId]",
  "/review/[weekId]",
  "/review/piece/[pieceId]",
  "/compliance/[pieceId]",
  "/setup/[companyId]",
  "/setup/[companyId]/*",
  "/strategy/interview",
  "/not-available",
  "/upgrade",
  "/dashboard",
  "/create",
  "/create/article",
  "/create/month",
  "/create/repurpose",
  "/generate/quick",
  "/strategy/competitor",
  "/admin/tickets",
];
