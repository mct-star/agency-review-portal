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
  it("treats an unflagged page as the default only when it is the company's one page in total", () => {
    expect(resolveDefaultPage([page("a")])?.id).toBe("a");
  });
  it("has no default when the only active page sits beside a switched-off one and nothing is flagged", () => {
    expect(resolveDefaultPage([page("agency", { is_active: false }), page("rebus")])).toBeNull();
    expect(resolveDefaultPage([page("agency"), page("rebus", { is_active: false })])).toBeNull();
  });
  it("has no default for a lone page that is switched off", () => {
    expect(resolveDefaultPage([page("a", { is_active: false })])).toBeNull();
  });
  it("fails closed when more than one page is flagged", () => {
    expect(resolveDefaultPage([flagged("a"), flagged("b")])).toBeNull();
  });
  it("has no default when there are no pages", () => {
    expect(resolveDefaultPage([])).toBeNull();
  });
});

describe("firstPageBecomesDefault", () => {
  it("is true only when the company has no page rows at all and one page is being connected", () => {
    expect(firstPageBecomesDefault([], 1)).toBe(true);
    expect(firstPageBecomesDefault([], 2)).toBe(false);
    expect(firstPageBecomesDefault([page("a", { is_active: false })], 1)).toBe(false);
    expect(firstPageBecomesDefault([flagged("a")], 1)).toBe(false);
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
