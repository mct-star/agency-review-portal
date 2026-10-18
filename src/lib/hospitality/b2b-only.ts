/**
 * Which pages belong to the business-to-business pack only.
 *
 * A hospitality venue's people are given a short menu without any of these,
 * but a page can still be reached by typing its address. The (app) layout
 * sends a hospitality user who does to /not-available, which says so in plain
 * words, instead of showing LinkedIn-era tools that were never set up for
 * them. The operator (admin) is never sent anywhere.
 *
 * It is a blocklist on purpose: a new page is open to hospitality unless it
 * is named here. b2b-only.test.ts lists every page under (app) and fails when
 * one has not been put in one camp or the other.
 */

export const B2B_ONLY_PAGE_PREFIXES = [
  "/strategy", // the strategy interview, competitor analysis and the shared strategy
  "/generate", // Content Studio and the week batch
  "/dashboard",
  "/create", // the create hub, article, month fill, repurpose
  "/plan", // the weekly planner
  "/compliance",
  "/analytics", // LinkedIn post analytics
  "/setup", // the operator's setup tree (the venue's own page is allowed below)
  "/content", // the business-to-business piece detail
  "/review", // the business-to-business review pages (the review home is an exact page below)
  "/upgrade",
  "/users",
  "/admin",
] as const;

/** Pages a hospitality venue uses that sit under a blocked prefix, matched by equality only. */
export const HOSPITALITY_EXACT_PAGES = ["/review"] as const;

/** A venue's own setup page: the company id in the path varies. */
const HOSPITALITY_SETUP_PAGE = /^\/setup\/[0-9a-f-]{36}\/hospitality(\/|$)/i;

/** Inside those prefixes, the pages a hospitality venue does use. */
export const HOSPITALITY_PAGES_INSIDE_B2B_PREFIXES = [
  "/generate/quick", // Write a post
  "/create/week-interview", // Talk through the week
  "/create/voice", // redirects to Talk through the week for a hospitality venue
  "/generate/single", // redirects to Write a post (next.config.ts)
] as const;

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isB2bOnlyPage(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if ((HOSPITALITY_EXACT_PAGES as readonly string[]).includes(path)) return false;
  if (HOSPITALITY_SETUP_PAGE.test(path)) return false;
  if (HOSPITALITY_PAGES_INSIDE_B2B_PREFIXES.some((p) => under(path, p))) return false;
  return B2B_ONLY_PAGE_PREFIXES.some((p) => under(path, p));
}

/** What the not-available page and the API refusals say. */
export const NOT_FOR_VENUE = {
  title: "That page is not part of your venue's tools",
  body: "Strategy, Content Studio, Compliance and the other business-to-business tools are not switched on for your venue. You write for Facebook and Instagram here.",
  apiMessage:
    "This is part of the business-to-business tools, which are not switched on for your venue. Use Write a post or Talk through the week instead.",
} as const;
