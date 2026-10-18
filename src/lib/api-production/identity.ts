/** Deterministic output identities make interrupted hosted authoring safe to resume. */
import { createHash } from "node:crypto";

export function productionId(...parts: string[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}
