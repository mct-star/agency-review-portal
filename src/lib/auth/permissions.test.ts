import { describe, expect, it } from "vitest";
import {
  canAccessCompany,
  canInvite,
  canSetPublishRight,
  companyIdFromCapturePath,
} from "./permissions";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("canAccessCompany", () => {
  it("admits an admin to any company", () => {
    expect(canAccessCompany({ id: "1", role: "admin", company_id: null }, A)).toBe(true);
  });
  it("admits a member to their own company only", () => {
    const m = { id: "2", role: "client", company_id: A };
    expect(canAccessCompany(m, A)).toBe(true);
    expect(canAccessCompany(m, B)).toBe(false);
  });
  it("refuses a missing profile or company", () => {
    expect(canAccessCompany(null, A)).toBe(false);
    expect(canAccessCompany({ id: "2", role: "client", company_id: A }, null)).toBe(false);
  });
  it("never admits a member with no company, even to a null id", () => {
    expect(canAccessCompany({ id: "3", role: "client", company_id: null }, "")).toBe(false);
  });
});

describe("invite rights", () => {
  it("lets a member invite into their own company but not another", () => {
    const m = { id: "2", role: "client", company_id: A };
    expect(canInvite(m, A)).toBe(true);
    expect(canInvite(m, B)).toBe(false);
  });
  it("lets only an admin grant the publish right", () => {
    expect(canSetPublishRight({ id: "1", role: "admin", company_id: null })).toBe(true);
    expect(canSetPublishRight({ id: "2", role: "client", company_id: A })).toBe(false);
    expect(canSetPublishRight(null)).toBe(false);
  });
});

describe("companyIdFromCapturePath", () => {
  it("reads the company from the first path segment", () => {
    expect(companyIdFromCapturePath(`${A}/photos/20261014_1_x.jpg`)).toBe(A);
  });
  it("returns null for anything that is not a company-prefixed key", () => {
    expect(companyIdFromCapturePath("photos/x.jpg")).toBeNull();
    expect(companyIdFromCapturePath("")).toBeNull();
  });
});
