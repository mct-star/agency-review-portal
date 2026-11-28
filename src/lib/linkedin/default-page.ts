/**
 * A company has one default LinkedIn page. Company page posts go to it
 * automatically and to no other page: any other page needs an explicit pick
 * and a confirmation that names it. The flag lives in the row's
 * platform_metadata, so a reconnect that rewrites the row must carry it over.
 */
export const DEFAULT_PAGE_KEY = "default_page";

export interface PageRow {
  id: string;
  account_name?: string | null;
  is_active?: boolean | null;
  platform_metadata?: Record<string, unknown> | null;
}

export function isFlaggedDefault(row: PageRow): boolean {
  return row.platform_metadata?.[DEFAULT_PAGE_KEY] === true;
}

/**
 * The page company page posts go to, from ALL of the company's company-page
 * rows (switched-off ones included). Fails closed: no flag and several active
 * pages, several flags, or a flagged page that is switched off all give null.
 * A company with one active page and no flag at all has that page as its
 * default, so a single-page company needs no setup.
 */
export function resolveDefaultPage<T extends PageRow>(pages: T[]): T | null {
  const flagged = pages.filter(isFlaggedDefault);
  if (flagged.length > 0) return flagged.length === 1 && flagged[0].is_active === true ? flagged[0] : null;
  const active = pages.filter((row) => row.is_active === true);
  return active.length === 1 ? active[0] : null;
}

/** A page becomes the default on connection only when the company has never had a page. */
export function firstPageBecomesDefault(existing: PageRow[]): boolean {
  return existing.length === 0;
}

export function withDefaultFlag(metadata: Record<string, unknown> | null | undefined, isDefault: boolean): Record<string, unknown> {
  const { [DEFAULT_PAGE_KEY]: _dropped, ...rest } = metadata || {};
  return isDefault ? { ...rest, [DEFAULT_PAGE_KEY]: true } : rest;
}

/** The question put to someone choosing a page that is not the default. */
export function confirmNonDefaultMessage(pageName: string, defaultName: string | null): string {
  return defaultName
    ? `Post to ${pageName}, not ${defaultName}?`
    : `No default LinkedIn page is set. Post to ${pageName}?`;
}
