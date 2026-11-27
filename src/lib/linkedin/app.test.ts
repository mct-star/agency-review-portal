import { describe, expect, it } from "vitest";
import { linkedInApp, PUBLISHER_SCOPES, CONTENT_PUBLISHER_CLIENT_ID, canPostAsOrganisation, canCommentAsMember, canCommentAs, canReadMemberAnalytics, canReadOrganisationFigures, canListMemberPosts } from "./app";

describe("which LinkedIn app the portal connects through", () => {
  it("uses the AGENCY Content Publisher app once its id and secret are both set", () => {
    const app = linkedInApp({ LINKEDIN_PUBLISHER_CLIENT_ID: "pub-id", LINKEDIN_PUBLISHER_CLIENT_SECRET: "pub-secret", LINKEDIN_CLIENT_ID: "old", LINKEDIN_CLIENT_SECRET: "old-secret" });
    expect(app).toEqual({ app: "publisher", clientId: "pub-id", clientSecret: "pub-secret", scopes: PUBLISHER_SCOPES });
  });

  it("asks for member and organisation posting, comments, and the page admin list", () => {
    const scopes = PUBLISHER_SCOPES.split(" ");
    for (const scope of ["r_basicprofile", "w_member_social", "w_member_social_feed", "w_organization_social", "w_organization_social_feed", "r_organization_social", "rw_organization_admin"]) {
      expect(scopes).toContain(scope);
    }
    expect(scopes).not.toContain("openid");
  });

  it("keeps the older app only while the publisher app is not configured", () => {
    expect(linkedInApp({ LINKEDIN_CLIENT_ID: "old", LINKEDIN_CLIENT_SECRET: "old-secret" })).toMatchObject({ app: "legacy", clientId: "old", scopes: "openid profile w_member_social" });
    expect(linkedInApp({ LINKEDIN_PUBLISHER_CLIENT_ID: "pub-id", LINKEDIN_CLIENT_ID: "old", LINKEDIN_CLIENT_SECRET: "old-secret" })).toMatchObject({ app: "legacy" });
    expect(linkedInApp({})).toBeNull();
  });

  it("reads what a granted scope string allows", () => {
    expect(canPostAsOrganisation(PUBLISHER_SCOPES)).toBe(true);
    expect(canPostAsOrganisation("openid profile w_member_social")).toBe(false);
    expect(canCommentAsMember(PUBLISHER_SCOPES.replace(/,/g, " "))).toBe(true);
    expect(canCommentAsMember("r_basicprofile,w_member_social,w_member_social_feed")).toBe(true);
    expect(canCommentAsMember("openid profile w_member_social")).toBe(false);
    expect(canCommentAs("linkedin_company", PUBLISHER_SCOPES)).toBe(true);
    expect(canCommentAs("linkedin_company", "w_member_social_feed w_organization_social")).toBe(false);
    expect(canCommentAs("linkedin_personal", "openid profile w_member_social")).toBe(false);
  });
});

describe("post figures access", () => {
  it("asks for the member analytics scopes and exactly the Content Publisher app's grant", () => {
    expect(PUBLISHER_SCOPES.split(" ").sort()).toEqual([
      "r_basicprofile", "r_member_postAnalytics", "r_member_profileAnalytics", "r_organization_social",
      "rw_organization_admin", "w_member_social", "w_member_social_feed", "w_organization_social", "w_organization_social_feed",
    ]);
    expect(PUBLISHER_SCOPES.split(" ")).not.toContain("openid");
    expect(PUBLISHER_SCOPES.split(" ")).not.toContain("profile");
  });

  it("treats the Content Publisher client id in the older slot as the publisher app", () => {
    expect(linkedInApp({ LINKEDIN_CLIENT_ID: CONTENT_PUBLISHER_CLIENT_ID, LINKEDIN_CLIENT_SECRET: "s" }))
      .toEqual({ app: "publisher", clientId: CONTENT_PUBLISHER_CLIENT_ID, clientSecret: "s", scopes: PUBLISHER_SCOPES });
  });

  it("reads which figures a grant allows", () => {
    expect(canReadMemberAnalytics(PUBLISHER_SCOPES)).toBe(true);
    expect(canReadMemberAnalytics("openid profile w_member_social")).toBe(false);
    expect(canReadOrganisationFigures(PUBLISHER_SCOPES)).toBe(true);
    expect(canReadOrganisationFigures("r_organization_social")).toBe(false);
    expect(canListMemberPosts(PUBLISHER_SCOPES)).toBe(false);
    expect(canListMemberPosts("r_basicprofile,r_member_social")).toBe(true);
  });
});
