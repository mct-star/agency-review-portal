import { createHash, randomBytes } from "crypto";

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
