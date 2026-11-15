import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptJson } from "@/lib/crypto";
import { legacyBlogTarget, NO_TARGET_REFUSAL, parseBlogTarget, resolveBlogTarget } from "./blog-target";

const good = {
  repo: "example-org/example-site", baseBranch: "develop", contentPath: "content/posts", imagePath: "static/img/posts",
  liveBaseUrl: "https://example.com/journal/", defaultAuthor: "Example Person",
  ctaClusters: [{ code: "pricing-help", label: "Pricing help" }],
};

type Row = Record<string, unknown>;
/** A fake that really filters by eq, so a read of another company's row would show. */
function fakeDb(rows: Row[]) {
  const reads: Array<Record<string, unknown>> = [];
  return {
    reads,
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (k: string, v: unknown) => { filters[k] = v; return chain; };
      chain.maybeSingle = async () => {
        reads.push({ table, ...filters });
        const hit = table === "company_api_configs" ? rows.find(r => Object.entries(filters).every(([k, v]) => r[k] === v)) : undefined;
        return { data: hit ?? null, error: null };
      };
      return chain;
    },
  };
}
const row = (companyId: string, settings: unknown = good, extra: Row = {}): Row => ({
  company_id: companyId, service_category: "blog_publishing", provider: "github_pull_request", is_active: true,
  provider_settings: settings, credentials_encrypted: encryptJson({ token: `token-for-${companyId}` }), ...extra,
});

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", "0".repeat(64));
  vi.stubEnv("WEBSITE_GITHUB_TOKEN", "legacy-token");
  vi.stubEnv("WEBSITE_GITHUB_REPO", "");
  vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("parseBlogTarget", () => {
  it("accepts good settings and tidies the trailing slash on the address", () => {
    expect(parseBlogTarget(good)).toEqual({
      provider: "github_pull_request", repo: "example-org/example-site", baseBranch: "develop", contentPath: "content/posts",
      imagePath: "static/img/posts", liveBaseUrl: "https://example.com/journal", defaultAuthor: "Example Person",
      ctaClusters: [{ code: "pricing-help", label: "Pricing help" }], source: "company_config",
    });
  });

  it("still accepts the legacy target's own values", () => {
    const l = legacyBlogTarget();
    expect(parseBlogTarget({ repo: l.repo, baseBranch: l.baseBranch, contentPath: l.contentPath, imagePath: l.imagePath, liveBaseUrl: l.liveBaseUrl, ctaClusters: l.ctaClusters }))
      .toMatchObject({ repo: l.repo, baseBranch: "main", contentPath: l.contentPath, imagePath: l.imagePath, liveBaseUrl: l.liveBaseUrl });
  });

  it("defaults the branch and folders, and allows no author and no services", () => {
    const t = parseBlogTarget({ repo: "a/b", liveBaseUrl: "https://example.com/blog" });
    expect(t).toMatchObject({ baseBranch: "main", contentPath: "src/content/blog", imagePath: "public/images/blog", defaultAuthor: null, ctaClusters: [] });
  });

  it.each([
    ["no settings", null, "settings are missing"],
    ["a repo that is not owner/name", { ...good, repo: "just-a-name" }, "repo"],
    ["a repo with a space", { ...good, repo: "owner/na me" }, "repo"],
    ["a bad branch", { ...good, baseBranch: "a..b" }, "baseBranch"],
    ["a content path with ..", { ...good, contentPath: "content/../secrets" }, "contentPath"],
    ["a content path with a leading slash", { ...good, contentPath: "/content" }, "contentPath"],
    ["an image path with ..", { ...good, imagePath: "../img" }, "imagePath"],
    ["an image path with a leading slash", { ...good, imagePath: "/public/img" }, "imagePath"],
    ["%2e%2e in a content path", { ...good, contentPath: "blog/%2e%2e/%2e%2e/%2e%2e" }, "contentPath"],
    ["# in an image path", { ...good, imagePath: "img#frag" }, "imagePath"],
    ["a space in a content path", { ...good, contentPath: "my posts" }, "contentPath"],
    ["a dot segment in an image path", { ...good, imagePath: "img/./x" }, "imagePath"],
    ["a repo of ../..", { ...good, repo: "../.." }, "repo"],
    ["a repo of ./x", { ...good, repo: "./x" }, "repo"],
    ["a repo name of ..", { ...good, repo: "owner/.." }, "repo"],
    ["a leading-dash branch", { ...good, baseBranch: "-main" }, "baseBranch"],
    ["a branch with a leading slash", { ...good, baseBranch: "/main" }, "baseBranch"],
    ["a branch with a trailing slash", { ...good, baseBranch: "main/" }, "baseBranch"],
    ["a live address with a query string", { ...good, liveBaseUrl: "https://example.com/blog?a" }, "liveBaseUrl"],
    ["a live address with a fragment", { ...good, liveBaseUrl: "https://example.com/blog#top" }, "liveBaseUrl"],
    ["an http live address", { ...good, liveBaseUrl: "http://example.com/blog" }, "liveBaseUrl"],
    ["no live address", { ...good, liveBaseUrl: undefined }, "liveBaseUrl"],
    ["a service list that is not a list", { ...good, ctaClusters: "launch" }, "ctaClusters"],
    ["a service code that is not a slug", { ...good, ctaClusters: [{ code: "Not A Slug", label: "x" }] }, "ctaClusters"],
    ["a service with no label", { ...good, ctaClusters: [{ code: "ok", label: " " }] }, "label"],
    ["an author that is not text", { ...good, defaultAuthor: 5 }, "defaultAuthor"],
  ])("refuses %s, naming the field", (_name, settings, field) => {
    const out = parseBlogTarget(settings);
    expect(out).toHaveProperty("error");
    expect((out as { error: string }).error).toContain(field);
  });
});

describe("resolveBlogTarget", () => {
  it("a company's own row wins over the legacy target, with its own token", async () => {
    const out = await resolveBlogTarget(fakeDb([row("co-1")]), "co-1");
    expect(out).toMatchObject({ target: { source: "company_config", repo: "example-org/example-site", baseBranch: "develop" }, token: "token-for-co-1" });
  });

  it("filters by company and never uses another company's row", async () => {
    const db = fakeDb([row("co-2")]);
    const out = await resolveBlogTarget(db, "co-1");
    expect(db.reads[0]).toMatchObject({ company_id: "co-1", service_category: "blog_publishing", provider: "github_pull_request", is_active: true });
    expect(out).toMatchObject({ target: { source: "legacy_default" }, token: "legacy-token" });
  });

  it("falls back to today's publisher when there is no row", async () => {
    vi.stubEnv("WEBSITE_GITHUB_REPO", "mct-star/other-site");
    const out = await resolveBlogTarget(fakeDb([]), "co-1");
    expect(out).toEqual({ target: legacyBlogTarget(), token: "legacy-token" });
    expect(legacyBlogTarget()).toMatchObject({
      repo: "mct-star/other-site", baseBranch: "main", contentPath: "src/content/blog", imagePath: "public/images/blog",
      liveBaseUrl: "https://agencymedicalmarketing.com/blog", defaultAuthor: "Michael Colling-Tuck", source: "legacy_default",
    });
    expect(legacyBlogTarget().ctaClusters.map(c => c.code)).toContain("launch");
  });

  it("uses the default repository when WEBSITE_GITHUB_REPO is not set", () => {
    expect(legacyBlogTarget().repo).toBe("mct-star/agency-website");
  });

  describe("WEBSITE_LEGACY_TARGET_COMPANY_ID", () => {
    it("when set, serves the named company and refuses any other with no row", async () => {
      vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "co-1");
      expect(await resolveBlogTarget(fakeDb([]), "co-1")).toMatchObject({ target: { source: "legacy_default" } });
      expect(await resolveBlogTarget(fakeDb([]), "co-2")).toEqual({ refusal: NO_TARGET_REFUSAL });
    });

    it("when set, a company with its own row is still served", async () => {
      vi.stubEnv("WEBSITE_LEGACY_TARGET_COMPANY_ID", "co-1");
      expect(await resolveBlogTarget(fakeDb([row("co-2")]), "co-2")).toMatchObject({ target: { source: "company_config" } });
    });

    it("when unset, every company without a row falls back", async () => {
      for (const id of ["co-1", "co-2", "co-3"]) {
        expect(await resolveBlogTarget(fakeDb([]), id)).toMatchObject({ target: { source: "legacy_default" }, token: "legacy-token" });
      }
    });
  });

  it("refuses a row with a bad setting, naming it, and does not fall back", async () => {
    const out = await resolveBlogTarget(fakeDb([row("co-1", { ...good, liveBaseUrl: "http://example.com" })]), "co-1");
    expect(out).toHaveProperty("refusal");
    expect((out as { refusal: string }).refusal).toContain("liveBaseUrl");
  });

  it("refuses a row whose token cannot be read, and does not fall back", async () => {
    const out = await resolveBlogTarget(fakeDb([row("co-1", good, { credentials_encrypted: "not:valid:data" })]), "co-1");
    expect(out).toHaveProperty("refusal");
  });

  it("serves a row with no token as target with a null token, never the legacy token", async () => {
    const out = await resolveBlogTarget(fakeDb([row("co-1", good, { credentials_encrypted: null })]), "co-1");
    expect(out).toMatchObject({ target: { source: "company_config" }, token: null });
  });
});
