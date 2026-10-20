import type { DirectSocialCredentials, DirectSocialPublishInput, DirectSocialAdapter } from "@/lib/publishing/direct-social";
import { createBlueskySessionClient, decodeBlueskySession, encodeBlueskySession } from "@/lib/bluesky/oauth";

const XRPC = "https://bsky.social/xrpc";

export type BlueskySession = {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
};

export function jwtExpiry(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? new Date(payload.exp * 1000).toISOString()
      : null;
  } catch {
    return null;
  }
}

export async function createBlueskySession(handle: string, appPassword: string): Promise<BlueskySession> {
  const response = await fetch(`${XRPC}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => null) as Partial<BlueskySession> | null;
  if (!response.ok || !body || typeof body.did !== "string" || typeof body.handle !== "string" || typeof body.accessJwt !== "string" || typeof body.refreshJwt !== "string") {
    throw new Error("Bluesky could not verify this handle and app password.");
  }
  return body as BlueskySession;
}

async function refreshBlueskySession(refreshJwt: string, signal: AbortSignal): Promise<BlueskySession> {
  const response = await fetch(`${XRPC}/com.atproto.server.refreshSession`, {
    method: "POST",
    headers: { authorization: `Bearer ${refreshJwt}` },
    redirect: "error",
    cache: "no-store",
    signal,
  });
  const body = await response.json().catch(() => null) as Partial<BlueskySession> | null;
  if (!response.ok || !body || typeof body.did !== "string" || typeof body.handle !== "string" || typeof body.accessJwt !== "string" || typeof body.refreshJwt !== "string") {
    throw new Error("The Bluesky connection needs reconnecting.");
  }
  return body as BlueskySession;
}

function facetForUrl(text: string) {
  const facets: Array<{ index: { byteStart: number; byteEnd: number }; features: Array<Record<string, string>> }> = [];
  const regexp = /https?:\/\/[^\s<>]+/g;
  for (const match of text.matchAll(regexp)) {
    const value = match[0];
    const start = match.index ?? 0;
    const byteStart = Buffer.byteLength(text.slice(0, start), "utf8");
    const byteEnd = byteStart + Buffer.byteLength(value, "utf8");
    facets.push({ index: { byteStart, byteEnd }, features: [{ $type: "app.bsky.richtext.facet#link", uri: value }] });
  }
  return facets;
}

async function fetchPublicImage(url: string, signal: AbortSignal) {
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal });
  if (!response.ok || !response.body) throw new Error("The approved Bluesky image could not be downloaded.");
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) throw new Error("Bluesky supports JPEG, PNG or WebP images in this pilot.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > 1_000_000) {
      await reader.cancel();
      throw new Error("Bluesky images must be no larger than 1 MB.");
    }
    chunks.push(chunk.value);
  }
  if (!total) throw new Error("The approved Bluesky image is empty.");
  return { bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), mimeType };
}

export const blueskyDirectAdapter: DirectSocialAdapter = {
  async refreshIfNeeded(input) {
    const expiry = input.credentials.expiresAt ? Date.parse(input.credentials.expiresAt) : Number.NaN;
    if (Number.isFinite(expiry) && expiry > Date.now() + 60_000) return { kind: "unchanged" };
    const oauthSession = decodeBlueskySession(input.credentials.accessToken);
    if (oauthSession) {
      const { client, sessionCache } = await createBlueskySessionClient(oauthSession);
      const session = await client.restore(oauthSession.did, "auto");
      const tokenInfo = await session.getTokenInfo("auto");
      const updated = sessionCache.get(oauthSession.did);
      if (!updated || !tokenInfo.expiresAt || tokenInfo.expiresAt.getTime() <= Date.now()) throw new Error("The Bluesky connection needs reconnecting.");
      return { kind: "refreshed", credentials: {
        accessToken: encodeBlueskySession(oauthSession.did, updated),
        refreshToken: null,
        expiresAt: tokenInfo.expiresAt.toISOString(),
        providerMetadata: input.credentials.providerMetadata,
      } };
    }
    if (!input.credentials.refreshToken) throw new Error("The Bluesky connection needs reconnecting.");
    const refreshed = await refreshBlueskySession(input.credentials.refreshToken, input.signal);
    return {
      kind: "refreshed",
      credentials: {
        accessToken: refreshed.accessJwt,
        refreshToken: refreshed.refreshJwt,
        expiresAt: jwtExpiry(refreshed.accessJwt),
        providerMetadata: { did: refreshed.did, handle: refreshed.handle },
      },
    };
  },

  async publish(input: DirectSocialPublishInput) {
    if (input.media && input.media.kind !== "image") return { kind: "not-published", message: "Bluesky supports one image or text only in this pilot." };
    const oauthSession = decodeBlueskySession(input.credentials.accessToken);
    let oauth: Awaited<ReturnType<typeof createBlueskySessionClient>> | null = null;
    let sdkSession: Awaited<ReturnType<Awaited<ReturnType<typeof createBlueskySessionClient>>["client"]["restore"]>> | null = null;
    if (oauthSession) {
      if (oauthSession.did !== input.account.accountId) return { kind: "not-published", message: "The saved Bluesky session does not match the selected account." };
      try {
        oauth = await createBlueskySessionClient(oauthSession, async (did, updated) => {
          const credentials = {
            accessToken: encodeBlueskySession(did, updated),
            refreshToken: null,
            expiresAt: updated.tokenSet.expires_at || null,
            providerMetadata: input.credentials.providerMetadata,
          };
          await input.onCredentialsRefreshed?.(credentials);
          input.credentials = credentials;
        });
        sdkSession = await oauth.client.restore(oauthSession.did, "auto");
      } catch {
        return { kind: "not-published", message: "The Bluesky connection needs reconnecting." };
      }
    }
    const request = (path: string, init: RequestInit) => sdkSession
      ? sdkSession.fetchHandler(path, { ...init, signal: input.signal })
      : fetch(`${XRPC}/${path.replace(/^\//, "").replace(/^xrpc\//, "")}`, { ...init, signal: input.signal, redirect: "error", cache: "no-store" });
    const authHeaders: Record<string, string> = oauthSession ? {} : { authorization: `Bearer ${input.credentials.accessToken}` };
    let blob: unknown;
    try {
      if (input.media) {
        const image = await fetchPublicImage(input.media.url, input.signal);
        const upload = await request("/xrpc/com.atproto.repo.uploadBlob", {
          method: "POST",
          headers: { ...authHeaders, "content-type": image.mimeType },
          body: new Uint8Array(image.bytes),
        });
        const uploaded = await upload.json().catch(() => null) as { blob?: unknown } | null;
        if (!upload.ok || !uploaded?.blob) return { kind: "not-published", message: "Bluesky could not prepare the approved image." };
        blob = uploaded.blob;
      }
    } catch {
      return { kind: "not-published", message: "The approved image could not be prepared for Bluesky." };
    }

    let response: Response;
    try {
      const record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text: input.text,
        createdAt: new Date().toISOString(),
      };
      const facets = facetForUrl(input.text);
      if (facets.length) record.facets = facets;
      if (blob) record.embed = { $type: "app.bsky.embed.images", images: [{ alt: input.text.slice(0, 300), image: blob }] };
      response = await request("/xrpc/com.atproto.repo.createRecord", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ repo: input.account.accountId, collection: "app.bsky.feed.post", record }),
      });
    } catch {
      return { kind: "uncertain", message: "Bluesky may have accepted the post. Check the account before taking further action." };
    }
    const body = await response.json().catch(() => null) as { uri?: unknown } | null;
    if (!response.ok) {
      return response.status >= 500 || response.status === 408 || response.status === 429
        ? { kind: "uncertain", message: "Bluesky may have accepted the post. Check the account before taking further action." }
        : { kind: "not-published", message: `Bluesky rejected the post (HTTP ${response.status}).` };
    }
    if (typeof body?.uri !== "string" || !body.uri) return { kind: "uncertain", message: "Bluesky did not confirm a post ID. Check the account before taking further action." };
    const handle = String(input.account.platformMetadata?.handle || input.account.accountName);
    const rkey = body.uri.split("/").pop();
    return { kind: "published", externalId: body.uri, externalUrl: `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey || "")}` };
  },
};

export function sessionCredentials(session: BlueskySession): DirectSocialCredentials {
  return { accessToken: session.accessJwt, refreshToken: session.refreshJwt, expiresAt: jwtExpiry(session.accessJwt), providerMetadata: { did: session.did, handle: session.handle } };
}
