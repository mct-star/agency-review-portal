/**
 * The page addresses the reminder emails and the Ops "waiting" route both
 * link to. One place, so the two cannot drift apart.
 */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://agency-review-portal.vercel.app")).replace(/\/+$/, "");
}

export const weekReviewUrl = (baseUrl: string, weekId: string): string => `${baseUrl}/review/${weekId}`;
export const weekDeployUrl = (baseUrl: string, weekId: string): string => `${baseUrl}/review/${weekId}/deploy`;
export const pieceUrl = (baseUrl: string, pieceId: string): string => `${baseUrl}/content/${pieceId}`;
