import { describe, expect, it } from "vitest";
import {
  canAccessCompany,
  canInvite,
  canManageChannels,
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

describe("canManageChannels", () => {
  const client = (over: Record<string, unknown> = {}) => ({ id: "c", role: "client", company_id: A, can_publish: true, ...over });
  it("admits an admin to any company", () => {
    expect(canManageChannels({ id: "1", role: "admin", company_id: null }, A)).toBe(true);
    expect(canManageChannels({ id: "1", role: "admin", company_id: null }, B)).toBe(true);
  });
  it("admits a client with the publish right to their own company only", () => {
    expect(canManageChannels(client(), A)).toBe(true);
    expect(canManageChannels(client(), B)).toBe(false);
  });
  it("refuses a client without the publish right, whether false, null or missing", () => {
    expect(canManageChannels(client({ can_publish: false }), A)).toBe(false);
    expect(canManageChannels(client({ can_publish: null }), A)).toBe(false);
    expect(canManageChannels(client({ can_publish: undefined }), A)).toBe(false);
  });
  it("refuses a missing profile, a missing company and an unknown role", () => {
    expect(canManageChannels(null, A)).toBe(false);
    expect(canManageChannels(client(), null)).toBe(false);
    expect(canManageChannels(client({ role: "viewer" }), A)).toBe(false);
  });
});
