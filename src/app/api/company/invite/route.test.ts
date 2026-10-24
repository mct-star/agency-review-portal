import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  caller: { id: "admin", role: "admin", company_id: null as string | null },
  existing: null as { id: string; role: string; company_id: string | null } | null,
  company: { id: "11111111-1111-4111-8111-111111111111", name: "Test company" } as { id: string; name: string } | null,
  generateLink: vi.fn(),
  upsert: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => mocks.caller,
  createAdminSupabaseClient: async () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "users" ? mocks.existing : mocks.company }) }) }),
      upsert: mocks.upsert,
    }),
  }),
}));
vi.mock("@/lib/email/resend", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/email/invite-email", () => ({ inviteEmail: () => ({ subject: "Invitation", html: "Test invitation" }) }));

import { POST } from "./route";

const companyId = "11111111-1111-4111-8111-111111111111";
const request = (input: Record<string, unknown> = {}) => new Request("http://localhost/api/company/invite", {
  method: "POST",
  body: JSON.stringify({ email: "person@example.com", companyId, ...input }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.caller = { id: "admin", role: "admin", company_id: null };
  mocks.existing = null;
  mocks.company = { id: companyId, name: "Test company" };
  mocks.generateLink.mockResolvedValue({ data: { user: { id: "new-user" }, properties: { hashed_token: "test-only-placeholder" } }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.sendEmail.mockResolvedValue({ success: true });
});

describe("company invitation delivery", () => {
  it("creates an admin-requested account without calling email and privately returns its one-time link", async () => {
    const response = await POST(request({ sendEmail: false }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, emailSent: false });
    expect(body.signInUrl).toContain("/auth/callback?token_hash=");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "invite", email: "person@example.com" }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "new-user", role: "client", company_id: companyId }), { onConflict: "id" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a member requesting no email without creating an account or returning a link", async () => {
    mocks.caller = { id: "member", role: "client", company_id: companyId };
    const response = await POST(request({ sendEmail: false }));
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("signInUrl");
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it.each([undefined, true])("preserves the normal invitation email when sendEmail is %s", async (sendEmail) => {
    const response = await POST(request({ sendEmail }));
    expect(await response.json()).toEqual({ ok: true, emailSent: true });
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it("keeps a failed member email from revealing a sign-in link", async () => {
    mocks.caller = { id: "member", role: "client", company_id: companyId };
    mocks.sendEmail.mockResolvedValue({ success: false, error: "Test delivery failed" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("signInUrl");
  });

  it("uses a magic link for an existing account without sending email", async () => {
    mocks.existing = { id: "new-user", role: "client", company_id: companyId };
    expect((await POST(request({ sendEmail: false }))).status).toBe(200);
    expect(mocks.generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "magiclink" }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("retains company and role validation in the no-email path", async () => {
    for (const existing of [
      { id: "other", role: "admin", company_id: null },
      { id: "other", role: "client", company_id: "22222222-2222-4222-8222-222222222222" },
    ]) {
      mocks.existing = existing;
      expect((await POST(request({ sendEmail: false }))).status).toBe(409);
    }
    mocks.existing = null;
    mocks.company = null;
    expect((await POST(request({ sendEmail: false }))).status).toBe(404);
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
