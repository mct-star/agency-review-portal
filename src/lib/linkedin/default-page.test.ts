import { describe, expect, it } from "vitest";
import { confirmNonDefaultMessage, firstPageBecomesDefault, resolveDefaultPage, withDefaultFlag } from "./default-page";

const page = (id: string, extra: Record<string, unknown> = {}) => ({ id, account_name: id, is_active: true, platform_metadata: {}, ...extra });
const flagged = (id: string, extra: Record<string, unknown> = {}) => page(id, { platform_metadata: { default_page: true }, ...extra });

describe("resolveDefaultPage", () => {
  it("returns the one active page that is flagged as the default", () => {
    expect(resolveDefaultPage([page("a"), flagged("b")])?.id).toBe("b");
  });
  it("never picks an unflagged page when a default exists, even if it is the only other active page", () => {
    expect(resolveDefaultPage([flagged("a", { is_active: false }), page("b")])).toBeNull();
  });
  it("has no default when two pages are active and none is flagged", () => {
    expect(resolveDefaultPage([page("a"), page("b")])).toBeNull();
  });
  it("treats a company's only active page as its default when nothing is flagged", () => {
    expect(resolveDefaultPage([page("a"), page("b", { is_active: false })])?.id).toBe("a");
  });
  it("fails closed when more than one page is flagged", () => {
    expect(resolveDefaultPage([flagged("a"), flagged("b")])).toBeNull();
  });
  it("has no default when there are no pages", () => {
    expect(resolveDefaultPage([])).toBeNull();
  });
});

describe("firstPageBecomesDefault", () => {
  it("is true only when the company has no page rows at all", () => {
    expect(firstPageBecomesDefault([])).toBe(true);
    expect(firstPageBecomesDefault([page("a", { is_active: false })])).toBe(false);
    expect(firstPageBecomesDefault([flagged("a")])).toBe(false);
  });
});

describe("withDefaultFlag", () => {
  it("sets or clears the flag and keeps every other key", () => {
    expect(withDefaultFlag({ app: "publisher" }, true)).toEqual({ app: "publisher", default_page: true });
    expect(withDefaultFlag({ app: "publisher", default_page: true }, false)).toEqual({ app: "publisher" });
    expect(withDefaultFlag(null, true)).toEqual({ default_page: true });
  });
});

describe("confirmNonDefaultMessage", () => {
  it("names both pages", () => {
    expect(confirmNonDefaultMessage("Rebus MedicoLegal", "AGENCY")).toBe("Post to Rebus MedicoLegal, not AGENCY?");
  });
  it("still names the page when no default is set", () => {
    expect(confirmNonDefaultMessage("Rebus MedicoLegal", null)).toBe("No default LinkedIn page is set. Post to Rebus MedicoLegal?");
  });
});
