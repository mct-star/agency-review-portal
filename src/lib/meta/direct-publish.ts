import { createHash } from "node:crypto";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";

export function directMetaJobId(companyId: string, pieceId: string, accountId: string, platform: "facebook" | "instagram") {
  const bytes = createHash("sha256").update(`meta-direct-v1:${companyId}:${pieceId}:${accountId}:${platform}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function metaMayHavePublished(status: number | null, phase: "prepare" | "container" | "publish") {
  return phase === "publish" && (status === null || status === 200 || status === 408 || status === 429 || status >= 500);
}

/** Applies the approved Markdown's visible text formatting while preserving hashtags for Meta captions. */
export function toMetaCaption(markdown: string) {
  return (markdown || "").replace(/\r\n/g, "\n").replace(/```[\s\S]*?```/g, "").replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?:;]|$)/gm, "$1$2").replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/`([^`]+)`/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/^[ \t]*\d+\.[ \t]+/gm, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function isMetaPublicMediaUrl(value: string, supabaseUrl?: string) {
  if (!isOurStorageUrl(value, supabaseUrl)) return false;
  try { const url = new URL(value); return url.pathname.startsWith("/storage/v1/object/public/") && !url.search; }
  catch { return false; }
}
