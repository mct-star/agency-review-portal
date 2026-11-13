import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** A new unguessable token for the staff upload link (192 bits). */
export function newStaffToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isPlausibleToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);
}

/** The address staff open on their phone. */
export function staffUploadUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/add-photo/${token}`;
}

/** The caller's address, hashed so the ledger does not hold raw IPs. */
export function hashIp(forwardedFor: string | null, salt: string): string {
  const ip = (forwardedFor || "unknown").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Capture links: the staff upload link, narrowed to one planned piece.
 *
 * The company token in the address still says whose link it is. The grant
 * (`?capture=`) is base64url(JSON {companyId, pieceId}) . expiry . HMAC-SHA256
 * and names the one piece a phone may add a video to. Routes still check the
 * piece against the company in the database before reading or writing.
 */
export const CAPTURE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface CaptureGrant {
  companyId: string;
  pieceId: string;
}

/** The signing secret. Empty means capture links are switched off (fail closed). */
export function captureLinkSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.CAPTURE_LINK_SECRET || env.STAFF_UPLOAD_SALT || "").trim();
}

function captureMac(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signCaptureGrant(grant: CaptureGrant, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + CAPTURE_LINK_TTL_SECONDS;
  const body = `${Buffer.from(JSON.stringify({ companyId: grant.companyId, pieceId: grant.pieceId })).toString("base64url")}.${exp}`;
  return `${body}.${captureMac(secret, body).toString("base64url")}`;
}

/** The grant a link names, or null when it is missing, malformed, tampered with, expired or unsignable. */
export function verifyCaptureGrant(value: unknown, secret: string, now = Date.now()): CaptureGrant | null {
  if (typeof value !== "string" || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [payload, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp * 1000 < now) return null;
  const expected = captureMac(secret, `${payload}.${expRaw}`);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed?.companyId !== "string" || typeof parsed?.pieceId !== "string") return null;
    return { companyId: parsed.companyId, pieceId: parsed.pieceId };
  } catch {
    return null;
  }
}

/** The address a phone opens to add a video to one planned piece. */
export function captureUploadUrl(baseUrl: string, token: string, grant: string): string {
  return `${staffUploadUrl(baseUrl, token)}?capture=${encodeURIComponent(grant)}`;
}
