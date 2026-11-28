import { describe, expect, it } from "vitest";
import { buildNotice, expiryState, noticeDue, noticeKey, reconnectUrl } from "./token-expiry";

const NOW = new Date("2027-01-10T07:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("expiryState", () => {
  it("is renew-due within 14 days, soon within 7, expired at zero", () => {
    expect(expiryState(inDays(30), NOW)).toMatchObject({ renewDue: false, soon: false, expired: false });
    expect(expiryState(inDays(14), NOW)).toMatchObject({ renewDue: true, soon: false });
    expect(expiryState(inDays(7), NOW)).toMatchObject({ renewDue: true, soon: true });
    expect(expiryState(inDays(-1), NOW)).toMatchObject({ expired: true, soon: false, renewDue: true });
  });
  it("treats a missing date as nothing to do", () => {
    expect(expiryState(null, NOW)).toMatchObject({ daysLeft: null, renewDue: false, soon: false, expired: false });
  });
});

describe("noticeDue", () => {
  it("warns at 7 days and on expiry, not before", () => {
    expect(noticeDue(inDays(8), {}, NOW)).toBeNull();
    expect(noticeDue(inDays(6), {}, NOW)).toBe("expiring_soon");
    expect(noticeDue(inDays(-1), {}, NOW)).toBe("expired");
  });
  it("sends each notice once per expiry date", () => {
    const exp = inDays(6);
    expect(noticeDue(exp, { [noticeKey("expiring_soon", exp)]: "x" }, NOW)).toBeNull();
    const expired = inDays(-1);
    expect(noticeDue(expired, { [noticeKey("expiring_soon", expired)]: "x" }, NOW)).toBe("expired");
    expect(noticeDue(expired, { [noticeKey("expired", expired)]: "x" }, NOW)).toBeNull();
  });
  it("starts again for a new expiry date after a renewal", () => {
    const old = inDays(5);
    const sent = { [noticeKey("expiring_soon", old)]: "x" };
    expect(noticeDue(inDays(6), sent, NOW)).toBe("expiring_soon"); // a different date is a new key
  });
});

describe("buildNotice", () => {
  const base = "https://agency-review-portal.vercel.app/";
  const soon = buildNotice([{ companyId: "c1", accountName: "AGENCY", kind: "expiring_soon", expiresAt: "2027-01-26T18:35:47Z", renewalNote: "" }], base);
  const gone = buildNotice([{ companyId: "c1", accountName: "AGENCY", kind: "expired", expiresAt: "2027-01-26T18:35:47Z", renewalNote: "Automatic renewal did not work: LinkedIn refused the renewal (invalid_grant), so the connection has to be reconnected by hand." }], base);
  const flat = (a: ReturnType<typeof buildNotice>) => JSON.stringify(a);
  it("names the account, the date and the reconnect page", () => {
    expect(soon.subject).toBe("LinkedIn connection expires soon: AGENCY");
    expect(soon.fields[0]).toEqual({ label: "AGENCY", value: "expires on 26 January 2027." });
    expect(soon.fixUrl).toBe("https://agency-review-portal.vercel.app/setup/c1/social");
    expect(reconnectUrl(base, "c1")).toBe(soon.fixUrl);
  });
  it("says publishing has stopped once expired, and carries the refresh-unavailable note", () => {
    expect(gone.subject).toBe("LinkedIn connection expired: AGENCY");
    expect(flat(gone)).toContain("Publishing to this account has stopped.");
    expect(flat(gone)).toContain("Automatic renewal did not work");
  });
  it("uses no em dashes", () => {
    for (const m of [soon, gone]) expect(flat(m)).not.toContain("\u2014");
  });
});
