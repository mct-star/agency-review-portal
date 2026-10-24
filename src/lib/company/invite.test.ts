import { describe, expect, it } from "vitest";
import { buildSignInUrl, planInvite } from "./invite";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const admin = { id: "a", role: "admin", company_id: null };
const member = { id: "m", role: "client", company_id: A };

describe("planInvite", () => {
  it("refuses a signed-out caller", () => {
    expect(planInvite(null, { email: "sam@example.com", companyId: A }, null)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("lets an admin invite into a named company", () => {
    const plan = planInvite(admin, { email: " Sam@Example.com ", companyId: A, fullName: "Sam" }, null);
    expect(plan).toMatchObject({ ok: true, email: "sam@example.com", companyId: A, fullName: "Sam", resend: false });
  });

  it("makes an admin name the company", () => {
    expect(planInvite(admin, { email: "sam@example.com" }, null)).toMatchObject({ ok: false, status: 400 });
  });

  it("defaults a member's invite to their own company", () => {
    expect(planInvite(member, { email: "sam@example.com" }, null)).toMatchObject({ ok: true, companyId: A });
  });

  it("stops a member inviting into another company", () => {
    expect(planInvite(member, { email: "sam@example.com", companyId: B }, null)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("only lets an admin grant the publish right", () => {
    const byMember = planInvite(member, { email: "x@example.com", canPublish: true }, null);
    const byAdmin = planInvite(admin, { email: "x@example.com", companyId: A, canPublish: true }, null);
    expect(byMember).toMatchObject({ ok: true, canPublish: false });
    expect(byAdmin).toMatchObject({ ok: true, canPublish: true });
  });

  it("defaults to email and restricts no-email setup to administrators", () => {
    expect(planInvite(admin, { email: "x@example.com", companyId: A }, null)).toMatchObject({ ok: true, sendEmail: true });
    expect(planInvite(admin, { email: "x@example.com", companyId: A, sendEmail: false }, null)).toMatchObject({ ok: true, sendEmail: false });
    expect(planInvite(member, { email: "x@example.com", sendEmail: false }, null)).toMatchObject({ ok: false, status: 403 });
    expect(planInvite(admin, { email: "x@example.com", companyId: A, sendEmail: "false" }, null)).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a bad email", () => {
    expect(planInvite(admin, { email: "not-an-email", companyId: A }, null)).toMatchObject({ ok: false, status: 400 });
  });

  it("resends rather than recreates when the person is already in the company", () => {
    const plan = planInvite(admin, { email: "sam@example.com", companyId: A }, { id: "u", role: "client", company_id: A });
    expect(plan).toMatchObject({ ok: true, resend: true });
  });

  it("will not repoint a member of another company or an administrator", () => {
    expect(
      planInvite(admin, { email: "sam@example.com", companyId: A }, { id: "u", role: "client", company_id: B })
    ).toMatchObject({ ok: false, status: 409 });
    expect(
      planInvite(admin, { email: "sam@example.com", companyId: A }, { id: "u", role: "admin", company_id: null })
    ).toMatchObject({ ok: false, status: 409 });
  });
});

describe("buildSignInUrl", () => {
  it("builds the callback address with the token and type", () => {
    expect(buildSignInUrl("https://app.example.com/", "abc 123", "invite")).toBe(
      "https://app.example.com/auth/callback?token_hash=abc%20123&type=invite"
    );
  });
});
