import { createHash } from "node:crypto";

/** Stable job identity makes one piece/account pair idempotent without schema changes. */
export function directLinkedInJobId(companyId: string, pieceId: string, accountId: string): string {
  const bytes = createHash("sha256").update(`linkedin-direct-v1:${companyId}:${pieceId}:${accountId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Transport failures and 5xx responses may have happened after LinkedIn accepted a post. */
export function linkedinOutcomeMayBeUncertain(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/\((\d{3})\)/)?.[1];
  if (!status) return true;
  return Number(status) >= 500;
}
