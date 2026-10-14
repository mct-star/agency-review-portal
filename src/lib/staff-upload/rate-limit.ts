/**
 * Rate limiting for the staff upload link, which needs no login.
 *
 * Counted in the database (staff_upload_attempts) so the limit holds across
 * serverless instances, unlike an in-memory counter. It fails closed: if the
 * count cannot be read, the request is refused.
 */

export const LIMITS = {
  /** Uploads one address may start in ten minutes. */
  perIpTenMinutes: 40,
  /** Uploads the whole link may take in an hour, whoever sends them. */
  perCompanyHour: 300,
};

export interface RateCounts {
  ipLastTenMinutes: number | null;
  companyLastHour: number | null;
}

export function decideRate(counts: RateCounts): { allowed: true } | { allowed: false; message: string } {
  if (counts.ipLastTenMinutes === null || counts.companyLastHour === null) {
    return { allowed: false, message: "Please try again in a minute." };
  }
  if (counts.ipLastTenMinutes >= LIMITS.perIpTenMinutes) {
    return { allowed: false, message: "That is a lot of photos at once. Please wait a few minutes and send the rest." };
  }
  if (counts.companyLastHour >= LIMITS.perCompanyHour) {
    return { allowed: false, message: "The link is busy. Please try again in a little while." };
  }
  return { allowed: true };
}
