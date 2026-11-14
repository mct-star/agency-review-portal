import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { CAPTURE_GRANT_MAX_USES, CAPTURE_LINK_TTL_SECONDS, captureLinkSecret, captureUploadUrl, signCaptureGrant, verifyCaptureGrant } from "./token";

const CO = "11111111-1111-4111-8111-111111111111";
const PIECE = "33333333-3333-4333-8333-333333333333";
const GRANT = "44444444-4444-4444-8444-444444444444";
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const base = { companyId: CO, pieceId: PIECE, grantId: GRANT };

describe("capture grant", () => {
  it("names the company, the piece and the stored grant, and verifies", () => {
    const g = signCaptureGrant(base, "s3cret", NOW);
    expect(verifyCaptureGrant(g, "s3cret", NOW + 1000)).toEqual(base);
  });
  it("lives 48 hours and takes at most 3 videos", () => {
    expect(CAPTURE_LINK_TTL_SECONDS).toBe(48 * 60 * 60);
    expect(CAPTURE_GRANT_MAX_USES).toBe(3);
    const g = signCaptureGrant(base, "s3cret", NOW);
    expect(verifyCaptureGrant(g, "s3cret", NOW + (CAPTURE_LINK_TTL_SECONDS - 60) * 1000)).not.toBeNull();
    expect(verifyCaptureGrant(g, "s3cret", NOW + (CAPTURE_LINK_TTL_SECONDS + 1) * 1000)).toBeNull();
  });
  it("is no longer valid after 7 days or after 2 days and a minute", () => {
    const g = signCaptureGrant(base, "s3cret", NOW);
    expect(verifyCaptureGrant(g, "s3cret", NOW + 49 * 3600 * 1000)).toBeNull();
    expect(verifyCaptureGrant(g, "s3cret", NOW + 7 * 24 * 3600 * 1000)).toBeNull();
  });
  it("refuses a tampered payload, another secret, an empty secret and junk", () => {
    const g = signCaptureGrant(base, "s3cret", NOW);
    const [body, exp, sig] = g.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, companyId: "22222222-2222-4222-8222-222222222222" })).toString("base64url");
    expect(verifyCaptureGrant(`${forged}.${exp}.${sig}`, "s3cret", NOW)).toBeNull();
    expect(verifyCaptureGrant(`${body}.${Number(exp) + 99999}.${sig}`, "s3cret", NOW)).toBeNull();
    expect(verifyCaptureGrant(g, "other", NOW)).toBeNull();
    expect(verifyCaptureGrant(g, "", NOW)).toBeNull();
    expect(verifyCaptureGrant("nope", "s3cret", NOW)).toBeNull();
    expect(verifyCaptureGrant(undefined, "s3cret", NOW)).toBeNull();
  });
  it("refuses an old-style grant that carries no stored grant id", () => {
    const body = `${Buffer.from(JSON.stringify({ companyId: CO, pieceId: PIECE })).toString("base64url")}.${Math.floor(NOW / 1000) + 1000}`;
    const sig = createHmac("sha256", "s3cret").update(body).digest().toString("base64url");
    expect(verifyCaptureGrant(`${body}.${sig}`, "s3cret", NOW)).toBeNull();
  });
  it("will not sign without a secret", () => {
    expect(() => signCaptureGrant(base, "", NOW)).toThrow();
  });
  it("builds the address a phone opens", () => {
    expect(captureUploadUrl("https://app.example.com/", "tok", "g.1.s")).toBe("https://app.example.com/add-photo/tok?capture=g.1.s");
  });
});

describe("capture link secret", () => {
  it("is the dedicated CAPTURE_LINK_SECRET only, never the IP hash salt", () => {
    expect(captureLinkSecret({ CAPTURE_LINK_SECRET: "  dedicated  " })).toBe("dedicated");
    expect(captureLinkSecret({ STAFF_UPLOAD_SALT: "the-ip-salt" })).toBe("");
    expect(captureLinkSecret({})).toBe("");
    expect(captureLinkSecret({ CAPTURE_LINK_SECRET: "   ", STAFF_UPLOAD_SALT: "the-ip-salt" })).toBe("");
  });
});
