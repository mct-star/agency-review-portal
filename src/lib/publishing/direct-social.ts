import { createHash } from "node:crypto";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";

export const DIRECT_SOCIAL_JOB_MARKER = "direct-social-v1" as const;

export const DIRECT_SOCIAL_PLATFORMS = [
  "bluesky",
  "threads",
  "twitter",
  "pinterest",
  "youtube",
] as const;

export type DirectSocialPlatform = (typeof DIRECT_SOCIAL_PLATFORMS)[number];

export type DirectSocialCredentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  providerMetadata?: Record<string, unknown>;
};

export type DirectSocialAccount = {
  id: string;
  companyId: string;
  platform: DirectSocialPlatform;
  accountId: string;
  accountName: string;
  platformMetadata: Record<string, unknown> | null;
  isActive: boolean;
};

export type DirectSocialMedia = {
  url: string;
  kind: "image" | "video";
  mimeType: string;
};

export type DirectSocialPublishOptions = Record<string, unknown>;

export type DirectSocialPublishInput = {
  account: DirectSocialAccount;
  credentials: DirectSocialCredentials;
  text: string;
  title: string | null;
  media: DirectSocialMedia | null;
  options: DirectSocialPublishOptions;
  signal: AbortSignal;
  /** Persist a provider's rotated credentials before it retries a request after refresh. */
  onCredentialsRefreshed?: (credentials: DirectSocialCredentials) => Promise<void>;
};

export type DirectSocialRefreshResult =
  | { kind: "unchanged" }
  | { kind: "refreshed"; credentials: DirectSocialCredentials };

export type DirectSocialPublishResult =
  | { kind: "published"; externalId: string; externalUrl?: string }
  | { kind: "not-published"; message: string }
  | { kind: "uncertain"; message: string };

export type DirectSocialAdapter = {
  refreshIfNeeded(input: DirectSocialPublishInput): Promise<DirectSocialRefreshResult>;
  publish(input: DirectSocialPublishInput): Promise<DirectSocialPublishResult>;
};

export function isDirectSocialPlatform(value: unknown): value is DirectSocialPlatform {
  return typeof value === "string" && (DIRECT_SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/** Stable UUID for a one-time post to one explicit account from one approved piece. */
export function directSocialJobId(
  companyId: string,
  pieceId: string,
  socialAccountId: string,
  platform: DirectSocialPlatform,
) {
  const bytes = createHash("sha256")
    .update(`${DIRECT_SOCIAL_JOB_MARKER}:${companyId}:${pieceId}:${socialAccountId}:${platform}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Converts approved Markdown to visible text while preserving hashtags. */
export function toDirectSocialText(markdown: string) {
  return (markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/(^|[\s(])_(\S(?:.*?\S)?)_(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/^[ \t]*\d+\.[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function directSocialNetwork(platform: DirectSocialPlatform): string {
  return platform === "twitter" ? "x" : platform;
}

/** Public storage objects only, with no signed query parameters or arbitrary host. */
export function isDirectSocialPublicMediaUrl(value: string) {
  if (!isOurStorageUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.pathname.startsWith("/storage/v1/object/public/") && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function validateDirectSocialOptions(platform: DirectSocialPlatform, value: unknown): DirectSocialPublishOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const options = value as Record<string, unknown>;
  const allowed: Record<DirectSocialPlatform, string[]> = {
    bluesky: [], threads: [], twitter: [],
    pinterest: ["boardId", "link"],
    youtube: ["privacy", "madeForKids"],
  };
  if (Object.keys(options).some((key) => !allowed[platform].includes(key))) return null;
  if (platform === "pinterest") {
    if (typeof options.boardId !== "string" || !options.boardId.trim()) return null;
    if (options.link !== undefined && options.link !== null) {
      if (typeof options.link !== "string") return null;
      try { if (new URL(options.link).protocol !== "https:") return null; } catch { return null; }
    }
    return { boardId: options.boardId.trim(), ...(typeof options.link === "string" && options.link ? { link: options.link } : {}) };
  }
  if (platform === "youtube") {
    if (!["public", "unlisted", "private"].includes(String(options.privacy)) || typeof options.madeForKids !== "boolean") return null;
    return { privacy: options.privacy, madeForKids: options.madeForKids };
  }
  return {};
}
