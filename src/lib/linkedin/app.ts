/**
 * Which LinkedIn developer app the portal connects through.
 *
 * "AGENCY Content Publisher" (app 266755647) holds the Community Management
 * API, so one sign-in can post as the member and as every page the member
 * administers, and add first comments as either. That product cannot sit
 * beside "Sign In with OpenID Connect", so the member is read with
 * r_basicprofile from /v2/me rather than from /v2/userinfo.
 *
 * The same app also reads post figures: r_member_postAnalytics (the Member Post
 * Analytics API) for a member's posts, and r_organization_social plus
 * rw_organization_admin for a page's posts and their statistics.
 *
 * The older app (member posting only, OpenID sign-in) is used only while the
 * publisher app's id and secret are not both set. Its slot (LINKEDIN_CLIENT_ID
 * and LINKEDIN_CLIENT_SECRET) can also hold the Content Publisher app's own
 * credentials: that client id is recognised and gets the publisher scopes.
 */

/** The AGENCY Content Publisher app's client id. A client id is public, not a secret. */
export const CONTENT_PUBLISHER_CLIENT_ID = "78kcxp1wezst17";

export const PUBLISHER_SCOPES = [
  "r_basicprofile",
  "w_member_social",
  "r_member_postAnalytics",
  "r_member_profileAnalytics",
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
    // The publisher app's credentials in the older slot are still the publisher app.
    if (legacyId === CONTENT_PUBLISHER_CLIENT_ID) {
      return { app: "publisher", clientId: legacyId, clientSecret: legacySecret, scopes: PUBLISHER_SCOPES };
    }
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

/** The grant can read the member's own post figures (Member Post Analytics API). */
export function canReadMemberAnalytics(scope: string | null | undefined): boolean {
  return granted(scope).has("r_member_postAnalytics");
}

/**
 * The grant can list the member's posts by author. LinkedIn restricts
 * r_member_social to approved apps, so the portal does not request it: this is
 * true only when a grant already carries it.
 */
export function canListMemberPosts(scope: string | null | undefined): boolean {
  return granted(scope).has("r_member_social");
}

/** The grant can list a page's posts and read their statistics. */
export function canReadOrganisationFigures(scope: string | null | undefined): boolean {
  const scopes = granted(scope);
  return scopes.has("r_organization_social") && scopes.has("rw_organization_admin");
}
