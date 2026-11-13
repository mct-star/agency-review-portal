import { describe, expect, it } from "vitest";
import { CAPTURE_LINK_TTL_SECONDS, captureUploadUrl, signCaptureGrant, verifyCaptureGrant } from "./token";

const CO = "11111111-1111-4111-8111-111111111111";
const PIECE = "33333333-3333-4333-8333-333333333333";
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);

describe("capture grant", () => {
  it("names the company and the piece and verifies", () => {
    const g = signCaptureGrant({ companyId: CO, pieceId: PIECE }, "s3cret", NOW);
    expect(verifyCaptureGrant(g, "s3cret", NOW + 1000)).toEqual({ companyId: CO, pieceId: PIECE });
  });
  it("expires", () => {
    const g = signCaptureGrant({ companyId: CO, pieceId: PIECE }, "s3cret", NOW);
    expect(verifyCaptureGrant(g, "s3cret", NOW + (CAPTURE_LINK_TTL_SECONDS + 1) * 1000)).toBeNull();
  });
  it("refuses a tampered payload, another secret, an empty secret and junk", () => {
    const g = signCaptureGrant({ companyId: CO, pieceId: PIECE }, "s3cret", NOW);
    const [body, exp, sig] = g.split(".");
    const forged = Buffer.from(JSON.stringify({ companyId: "22222222-2222-4222-8222-222222222222", pieceId: PIECE })).toString("base64url");
    expect(verifyCaptureGrant(`${forged}.${exp}.${sig}`, "s3cret", NOW)).toBeNull();
    expect(verifyCaptureGrant(`${body}.${Number(exp) + 99999}.${sig}`, "s3cret", NOW)).toBeNull();
    expect(verifyCaptureGrant(g, "other", NOW)).toBeNull();
    expect(verifyCaptureGrant(g, "", NOW)).toBeNull();
    expect(verifyCaptureGrant("nope", "s3cret", NOW)).toBeNull();
    expect(verifyCaptureGrant(undefined, "s3cret", NOW)).toBeNull();
  });
  it("builds the address a phone opens", () => {
    expect(captureUploadUrl("https://app.example.com/", "tok", "g.1.s")).toBe("https://app.example.com/add-photo/tok?capture=g.1.s");
  });
});
