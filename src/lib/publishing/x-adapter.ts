import type { DirectSocialAdapter, DirectSocialPublishInput, DirectSocialPublishResult } from "@/lib/publishing/direct-social";
import { refreshXGrant, getXIdentity, xClientId, xClientSecret } from "@/lib/x/oauth";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";

const X_API = "https://api.x.com/2";
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function isXConfigured(env: Record<string, string | undefined> = process.env) {
  return !!env.X_CLIENT_ID?.trim() && !!env.X_CLIENT_SECRET?.trim();
}

async function checkedJson<T>(url: string, accessToken: string, init: RequestInit): Promise<{ status: number; ok: boolean; data: T }> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as T;
  return { status: response.status, ok: response.ok, data };
}

async function readImage(url: string, expectedMime: string, signal: AbortSignal) {
  if (!isOurStorageUrl(url) || !isPublicSupabaseObject(url)) throw new Error("The X image must be in this portal's public storage");
  if (!new Set(["image/jpeg", "image/png"]).has(expectedMime)) throw new Error("X supports JPEG or PNG images for this post");
  const response = await fetch(url, { method: "GET", redirect: "error", cache: "no-store", signal });
  if (!response.ok || !response.body) throw new Error("The approved X image could not be downloaded");
  const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mime !== expectedMime) throw new Error("The approved X image type changed after it was queued");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > IMAGE_MAX_BYTES) throw new Error("The X image exceeds this portal's 5 MB upload limit");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > IMAGE_MAX_BYTES) {
        await reader.cancel();
        throw new Error("The X image exceeds this portal's 5 MB upload limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error("The approved X image is empty");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function isPublicSupabaseObject(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.startsWith("/storage/v1/object/public/") && !url.search;
  } catch {
    return false;
  }
}

function failFromX(status: number, provider: string): DirectSocialPublishResult {
  if (status === 408 || status === 429 || status >= 500) return { kind: "uncertain", message: `${provider} did not confirm whether it published the post. Check the account before retrying.` };
  return { kind: "not-published", message: `${provider} rejected the post (HTTP ${status}). Correct the post or connection before trying again.` };
}

export const xAdapter: DirectSocialAdapter = {
  async refreshIfNeeded(input) {
    const expiry = input.credentials.expiresAt ? Date.parse(input.credentials.expiresAt) : Number.NaN;
    if (Number.isFinite(expiry) && expiry > Date.now() + 90_000) return { kind: "unchanged" };
    if (!input.credentials.refreshToken || !xClientId() || !xClientSecret()) throw new Error("The X connection needs reconnecting");
    const grant = await refreshXGrant(input.credentials.refreshToken, xClientId(), xClientSecret());
    return {
      kind: "refreshed",
      credentials: { accessToken: grant.accessToken, refreshToken: grant.refreshToken, expiresAt: grant.expiresAt, providerMetadata: { scope: grant.scope } },
    };
  },

  async publish(input) {
    if (input.account.platform !== "twitter") return { kind: "not-published", message: "This connection is not an X account." };
    if (!input.text.trim()) return { kind: "not-published", message: "The X post has no text." };
    if (input.media && input.media.kind !== "image") return { kind: "not-published", message: "X direct publishing currently supports one image per post." };

    let identity;
    try {
      identity = await getXIdentity(input.credentials.accessToken);
    } catch {
      return { kind: "not-published", message: "The X account could not be verified. Reconnect it before publishing." };
    }
    if (identity.id !== input.account.accountId) return { kind: "not-published", message: "The saved X token no longer matches the selected account." };

    let mediaId: string | undefined;
    if (input.media) {
      let bytes: Buffer;
      try {
        bytes = await readImage(input.media.url, input.media.mimeType.toLowerCase(), input.signal);
      } catch (error) {
        return { kind: "not-published", message: error instanceof Error ? error.message : "The X image could not be prepared." };
      }
      let uploaded: { status: number; ok: boolean; data: { data?: { id?: unknown } } };
      try {
        uploaded = await checkedJson(`${X_API}/media/upload`, input.credentials.accessToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ media: bytes.toString("base64"), media_category: "tweet_image" }),
          signal: input.signal,
        });
      } catch {
        return { kind: "not-published", message: "X did not confirm that the image upload completed. The post was not submitted." };
      }
      if (!uploaded.ok) return { kind: "not-published", message: `X could not prepare the post image (HTTP ${uploaded.status}).` };
      if (typeof uploaded.data.data?.id !== "string" || !uploaded.data.data.id) return { kind: "not-published", message: "X did not return an image identifier. The post was not submitted." };
      mediaId = uploaded.data.data.id;
    }

    let response: { status: number; ok: boolean; data: { data?: { id?: unknown } } };
    try {
      response = await checkedJson(`${X_API}/tweets`, input.credentials.accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }),
        signal: input.signal,
      });
    } catch {
      return { kind: "uncertain", message: "X may have accepted the post, but its response was not received. Check the account before retrying." };
    }
    if (!response.ok) return failFromX(response.status, "X");
    const id = response.data.data?.id;
    if (typeof id !== "string" || !id) return { kind: "uncertain", message: "X accepted a post request without returning its post ID. Check the account before retrying." };
    return { kind: "published", externalId: id, externalUrl: `https://x.com/${encodeURIComponent(identity.username)}/status/${encodeURIComponent(id)}` };
  },
};
