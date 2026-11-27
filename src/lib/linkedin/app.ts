/**
 * Which LinkedIn developer app the portal connects through.
 *
 * "AGENCY Content Publisher" (app 266755647) holds the Community Management
 * API, so one sign-in can post as the member and as every page the member
 * administers, and add first comments as either. That product cannot sit
 * beside "Sign In with OpenID Connect", so the member is read with
 * r_basicprofile from /v2/me rather than from /v2/userinfo.
 *
 * The older app (member posting only, OpenID sign-in) is used only while the
 * publisher app's id and secret are not both set.
 */

export const PUBLISHER_SCOPES = [
  "r_basicprofile",
  "w_member_social",
  "w_member_social_feed",
  "w_organization_social",
  "w_organization_social_feed",
  "r_organization_social",
  "rw_organization_admin",
].join(" ");

export const LEGACY_SCOPES = "openid profile w_member_social";

export type LinkedInAppConfig = {
  app: "publisher" | "legacy";
  clientId: string;
  clientSecret: string;
  scopes: string;
};

export function linkedInApp(env: Record<string, string | undefined> = process.env): LinkedInAppConfig | null {
  const publisherId = env.LINKEDIN_PUBLISHER_CLIENT_ID?.trim();
  const publisherSecret = env.LINKEDIN_PUBLISHER_CLIENT_SECRET?.trim();
  if (publisherId && publisherSecret) {
    return { app: "publisher", clientId: publisherId, clientSecret: publisherSecret, scopes: PUBLISHER_SCOPES };
  }
  const legacyId = env.LINKEDIN_CLIENT_ID?.trim();
  const legacySecret = env.LINKEDIN_CLIENT_SECRET?.trim();
  if (legacyId && legacySecret) {
    return { app: "legacy", clientId: legacyId, clientSecret: legacySecret, scopes: LEGACY_SCOPES };
  }
  return null;
}

function granted(scope: string | null | undefined): Set<string> {
  return new Set((scope || "").split(/[\s,]+/).filter(Boolean));
}

/** The grant can list pages and post and comment as them. */
export function canPostAsOrganisation(scope: string | null | undefined): boolean {
  const scopes = granted(scope);
  return scopes.has("w_organization_social") && scopes.has("rw_organization_admin");
}

/** The grant can add a comment as the member (the older app's could not: 403). */
export function canCommentAsMember(scope: string | null | undefined): boolean {
  return granted(scope).has("w_member_social_feed");
}

/** The grant includes OpenID sign-in, so /v2/userinfo answers. */
export function hasOpenId(scope: string | null | undefined): boolean {
  return granted(scope).has("openid");
}

/** The grant can add a first comment as this kind of account. */
export function canCommentAs(platform: string, scope: string | null | undefined): boolean {
  const scopes = granted(scope);
  return platform === "linkedin_company" ? scopes.has("w_organization_social_feed") : scopes.has("w_member_social_feed");
}
