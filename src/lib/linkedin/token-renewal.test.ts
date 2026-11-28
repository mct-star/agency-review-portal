import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedInTokenError } from "./token-error";

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v.replace(/^enc:/, ""), encrypt: (v: string) => `enc:${v}` }));
vi.mock("./app", async (orig) => ({ ...(await orig<typeof import("./app")>()), linkedInApp: vi.fn(() => ({ app: "publisher", clientId: "id", clientSecret: "secret", scopes: "s" })) }));

import { linkedInApp } from "./app";
import type { OpsAlert } from "@/lib/alerts/ops-alert";
import { runTokenRenewal, type AccountRow } from "./token-renewal";

const NOW = new Date("2027-01-10T07:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

/** A tiny in-memory company_social_accounts table that honours update().eq(). */
function db(rows: AccountRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    from() {
      return {
        select: () => ({ in: () => ({ not: () => Promise.resolve({ data: rows, error: null }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            eq: () => {
              updates.push({ id, patch });
              const row = rows.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
  };
  return { client: client as never, updates };
}
const row = (over: Partial<AccountRow> & { id: string }): AccountRow => ({
  company_id: "c1", platform: "linkedin_personal", account_name: "Michael", is_active: true,
  access_token_encrypted: "enc:old", refresh_token_encrypted: "enc:rt", token_expires_at: inDays(30), platform_metadata: { app: "publisher", scope: "a b" }, ...over,
});
const deps = (over = {}) => ({
  now: NOW, baseUrl: "https://portal.test",
  alert: vi.fn(async (_a: OpsAlert) => ({ delivered: true })),
  refresh: vi.fn(async () => ({ accessToken: "new", refreshToken: "rt2", expiresIn: 1, expiresAt: inDays(60), scope: "a b c" })), ...over,
});

beforeEach(() => vi.mocked(linkedInApp).mockReturnValue({ app: "publisher", clientId: "id", clientSecret: "secret", scopes: "s" }));

describe("runTokenRenewal", () => {
  it("does nothing for tokens with more than 14 days left", async () => {
    const { client, updates } = db([row({ id: "a" })]);
    const d = deps();
    const s = await runTokenRenewal(client, d);
    expect(d.refresh).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(s.noticesSent).toBe(0);
  });

  it("refreshes once for accounts sharing a grant, saves the new expiry, and sends no warning", async () => {
    const rows = [row({ id: "a", token_expires_at: inDays(10) }), row({ id: "b", platform: "linkedin_company", account_name: "AGENCY", token_expires_at: inDays(10) })];
    const { client } = db(rows);
    const d = deps();
    const s = await runTokenRenewal(client, d);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.refresh).toHaveBeenCalledWith("rt", "id", "secret");
    expect(rows.every((r) => r.token_expires_at === inDays(60) && r.access_token_encrypted === "enc:new" && r.refresh_token_encrypted === "enc:rt2")).toBe(true);
    expect((rows[0].platform_metadata as { token_renewal: { outcome: string } }).token_renewal.outcome).toBe("refreshed");
    expect(s.noticesSent).toBe(0);
    expect(d.alert).not.toHaveBeenCalled();
  });

  it("when LinkedIn refuses, records the failure and warns at 7 days by email and Slack", async () => {
    const rows = [row({ id: "a", token_expires_at: inDays(5) })];
    const { client } = db(rows);
    const d = deps({ refresh: vi.fn(async () => { throw new LinkedInTokenError("raw body must not leak", 400, "invalid_grant"); }) });
    const s = await runTokenRenewal(client, d);
    expect(s.failed).toBe(1);
    expect(d.alert).toHaveBeenCalledTimes(1);
    const sent = d.alert.mock.calls[0][0] as OpsAlert;
    expect(sent.subject).toContain("expires soon");
    expect(sent.fixUrl).toBe("https://portal.test/setup/c1/social");
    expect(JSON.stringify(sent)).toContain("invalid_grant");
    expect(JSON.stringify(sent)).not.toContain("raw body");
    expect((rows[0].platform_metadata as { token_renewal: { outcome: string } }).token_renewal.outcome).toBe("failed");
  });

  it("with no refresh token stored, renewal is unavailable but the warning still goes", async () => {
    const rows = [row({ id: "a", refresh_token_encrypted: null, token_expires_at: inDays(3) })];
    const { client } = db(rows);
    const d = deps();
    const s = await runTokenRenewal(client, d);
    expect(d.refresh).not.toHaveBeenCalled();
    expect(s.unavailable).toBe(1);
    expect(s.noticesSent).toBe(1);
    expect(JSON.stringify(d.alert.mock.calls[0][0])).toContain("no refresh token is stored");
  });

  it("sends each warning once per account per expiry date, across repeated runs", async () => {
    const rows = [row({ id: "a", refresh_token_encrypted: null, token_expires_at: inDays(5) })];
    const { client } = db(rows);
    const d = deps();
    await runTokenRenewal(client, d);
    await runTokenRenewal(client, d);
    expect(d.alert).toHaveBeenCalledTimes(1);
    // ...and a second, different notice on expiry.
    const later = deps({ now: new Date(NOW.getTime() + 6 * 86_400_000) });
    await runTokenRenewal(client, later);
    expect(later.alert).toHaveBeenCalledTimes(1);
    expect((later.alert.mock.calls[0][0] as OpsAlert).subject).toContain("expired");
    await runTokenRenewal(client, later);
    expect(later.alert).toHaveBeenCalledTimes(1);
  });

  it("combines accounts of one company into one message", async () => {
    const rows = [row({ id: "a", refresh_token_encrypted: null, token_expires_at: inDays(5) }), row({ id: "b", platform: "linkedin_company", account_name: "AGENCY", refresh_token_encrypted: null, token_expires_at: inDays(5) })];
    const { client } = db(rows);
    const d = deps();
    const s = await runTokenRenewal(client, d);
    expect(d.alert).toHaveBeenCalledTimes(1);
    expect(s.noticesSent).toBe(2);
  });

  it("releases the claim when the alert is not delivered, so the next run retries", async () => {
    const rows = [row({ id: "a", refresh_token_encrypted: null, token_expires_at: inDays(5) })];
    const { client } = db(rows);
    const failing = deps({ alert: vi.fn(async () => ({ delivered: false })) });
    const s = await runTokenRenewal(client, failing);
    expect(s.noticesFailed).toBe(1);
    expect(rows[0].platform_metadata).not.toHaveProperty("expiry_notices");
    const retry = deps();
    expect((await runTokenRenewal(client, retry)).noticesSent).toBe(1);
  });

  it("treats a thrown alert as not delivered", async () => {
    const rows = [row({ id: "a", refresh_token_encrypted: null, token_expires_at: inDays(5) })];
    const { client } = db(rows);
    const s = await runTokenRenewal(client, deps({ alert: vi.fn(async () => { throw new Error("boom"); }) }));
    expect(s.noticesFailed).toBe(1);
  });

  it("does not try to refresh when the app credentials are missing", async () => {
    vi.mocked(linkedInApp).mockReturnValue(null);
    const rows = [row({ id: "a", token_expires_at: inDays(10) })];
    const { client } = db(rows);
    const d = deps();
    const s = await runTokenRenewal(client, d);
    expect(d.refresh).not.toHaveBeenCalled();
    expect(s.unavailable).toBe(1);
  });
});
