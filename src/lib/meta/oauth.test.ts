import { afterEach, describe, expect, it } from "vitest";
import { createMetaState, hasMetaPermissions, META_SCOPES, selectMetaPage, verifyMetaState } from "./oauth";

const secret = process.env.META_APP_SECRET;
afterEach(() => { if (secret === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = secret; });

describe("Meta OAuth state and grant selection", () => {
  it("binds expiring state to the nonce, user and company", async () => {
    process.env.META_APP_SECRET = "test-meta-app-secret";
    const now = 1_800_000_000_000;
    const state = createMetaState({ companyId: "company-a", userId: "user-a", nonce: "nonce-a" }, now);
    expect(verifyMetaState(state, "nonce-a", now)).toMatchObject({ companyId: "company-a", userId: "user-a" });
    expect(verifyMetaState(state, "nonce-b", now)).toBeNull();
    expect(verifyMetaState(state + "x", "nonce-a", now)).toBeNull();
    expect(verifyMetaState(state, "nonce-a", now + 11 * 60_000)).toBeNull();
  });

  it("signs the local return destination and refuses a tampered destination", () => {
    process.env.META_APP_SECRET = "test-meta-app-secret";
    const state = createMetaState({ companyId: "company-a", userId: "user-a", nonce: "nonce-a", returnTo: "setup" });
    expect(verifyMetaState(state, "nonce-a")?.returnTo).toBe("setup");
    const [version, payload, signature] = state.split(".");
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), returnTo: "publish" })).toString("base64url");
    expect(verifyMetaState(`${version}.${changed}.${signature}`, "nonce-a")).toBeNull();
  });

  it("requests only the selected Facebook Login permission family", () => {
    expect(META_SCOPES).toEqual(["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"]);
    expect(hasMetaPermissions(META_SCOPES.map((permission) => ({ permission, status: "granted" })))).toBe(true);
    expect(hasMetaPermissions([{ permission: "pages_show_list", status: "declined" }])).toBe(false);
  });

  it("accepts only the explicitly selected Page and its linked Instagram identity", () => {
    const pages = [
      { id: "page-a", name: "Page A", access_token: "token-a", instagram_business_account: { id: "ig-a" } },
      { id: "page-b", name: "Page B", access_token: "token-b", instagram_business_account: { id: "ig-b" } },
    ];
    expect(selectMetaPage(pages, "page-b", "ig-b")?.access_token).toBe("token-b");
    expect(selectMetaPage(pages, "page-b", "ig-a")).toBeNull();
    expect(selectMetaPage(pages, "page-missing")).toBeNull();
  });
});
