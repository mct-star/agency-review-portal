import type { DirectSocialAdapter, DirectSocialPlatform } from "./direct-social";
import { blueskyDirectAdapter } from "@/lib/bluesky/direct";
import { blueskyOAuthConfig } from "@/lib/bluesky/oauth";
import { threadsDirectAdapter } from "@/lib/threads/direct";
import { threadsConfig } from "@/lib/threads/oauth";
import { xAdapter, isXConfigured } from "./x-adapter";
import { pinterestAdapter, isPinterestConfigured } from "./pinterest-adapter";
import { youtubeAdapter, youtubeConfigured } from "@/lib/youtube/direct-publish";

/** The approved publishing queue resolves all direct providers through this registry. */
export function getDirectSocialAdapter(platform: DirectSocialPlatform): DirectSocialAdapter | null {
  if (!directSocialConfigured(platform)) return null;
  return { bluesky: blueskyDirectAdapter, threads: threadsDirectAdapter, twitter: xAdapter, pinterest: pinterestAdapter, youtube: youtubeAdapter }[platform] || null;
}

export function directSocialConfigured(platform: DirectSocialPlatform): boolean {
  switch (platform) {
    case "bluesky": return !!blueskyOAuthConfig();
    case "threads": return !!threadsConfig();
    case "twitter": return isXConfigured();
    case "pinterest": return isPinterestConfigured();
    case "youtube": return youtubeConfigured();
    default: return false;
  }
}
