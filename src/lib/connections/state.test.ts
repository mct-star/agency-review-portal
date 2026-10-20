import { describe, expect, it } from "vitest";
import { groupMetaConnections, socialOAuthReturnPath } from "./state";

describe("connection state", () => {
  it("groups a Page and Instagram under one disconnect action and preserves independent Pages", () => {
    const groups = groupMetaConnections([
      { id: "ig-a", platform: "instagram", accountName: "Profile A", pageId: "page-a", usable: true },
      { id: "fb-a", platform: "facebook", accountName: "Page A", accountId: "page-a", pageId: "page-a", usable: true },
      { id: "fb-b", platform: "facebook", accountName: "Page B", accountId: "page-b", pageId: "page-b", usable: false },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ disconnectId: "fb-a", usable: true });
    expect(groups[0].accounts).toHaveLength(2);
    expect(groups[1]).toMatchObject({ disconnectId: "fb-b", usable: false });
  });
  it("keeps an unmatched Instagram account visible and marks any expired linked grant", () => {
    const groups = groupMetaConnections([
      { id: "fb", platform: "facebook", accountName: "Page", accountId: "page", usable: true },
      { id: "ig", platform: "instagram", accountName: "Profile", pageId: "page", usable: false },
      { id: "orphan", platform: "instagram", accountName: "Other profile", usable: true },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].usable).toBe(false);
  });
  it("allows fixed local callback destinations and never an arbitrary redirect", () => {
    expect(socialOAuthReturnPath("company-a", "setup", "meta_choose_page=1")).toBe("/setup/company-a/social?meta_choose_page=1");
    expect(socialOAuthReturnPath("company-a", "publish", "threads_connected=1")).toBe("/publish?threads_connected=1&companyId=company-a");
    expect(socialOAuthReturnPath("company-a", "https://other.example", "bluesky_error=cancelled")).toBe("/setup/company-a/social?bluesky_error=cancelled");
    expect(socialOAuthReturnPath(undefined, "setup", "meta_error=invalid_session")).toBe("/publish?meta_error=invalid_session");
  });
});
