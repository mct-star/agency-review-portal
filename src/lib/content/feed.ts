// Two LinkedIn feeds can share one company's week: the spokesperson's own
// posts and the company page. The Mac write-back (portal_writeback.py) files
// company-page posts with post types prefixed "agency_" (agency_product_story,
// agency_book_a_call_cta), so a page post can sit beside the spokesperson's
// post on the same day and the portal can tell them apart without a schema
// change. Keep the prefix in step with AGENCY_PREFIX in portal_writeback.py.

export type Feed = "person" | "company_page";

export const COMPANY_PAGE_PREFIX = "agency_";

export function pieceFeed(postType: string | null | undefined): Feed {
  return postType?.startsWith(COMPANY_PAGE_PREFIX) ? "company_page" : "person";
}

/** The post type without its feed prefix, for labels and type lookups. */
export function basePostType(postType: string | null | undefined): string | null {
  if (!postType) return null;
  return postType.startsWith(COMPANY_PAGE_PREFIX)
    ? postType.slice(COMPANY_PAGE_PREFIX.length)
    : postType;
}

/** True when a set of pieces holds posts from both feeds. */
export function hasBothFeeds(pieces: { post_type: string | null }[]): boolean {
  const feeds = new Set(pieces.map((p) => pieceFeed(p.post_type)));
  return feeds.size > 1;
}

/** The chip shown on a piece: "Company page" or the spokesperson's name. */
export function feedLabel(feed: Feed, spokespersonName?: string | null): string {
  if (feed === "company_page") return "Company page";
  return spokespersonName?.trim() || "Personal";
}
