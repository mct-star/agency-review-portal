import type { DirectSocialAdapter } from "@/lib/publishing/direct-social";
import { ThreadsApiError, threadsConfig, threadsRequest, type ThreadsToken } from "@/lib/threads/oauth";

const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60_000;

async function refreshToken(token: string, signal: AbortSignal) {
  const url = new URL("https://graph.threads.net/refresh_access_token");
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal });
  const body = await response.json().catch(() => null) as ThreadsToken | null;
  if (!response.ok || !body || typeof body.access_token !== "string" || !Number.isFinite(body.expires_in) || !body.expires_in) {
    throw new Error("The Threads connection needs reconnecting.");
  }
  return body;
}

export const threadsDirectAdapter: DirectSocialAdapter = {
  async refreshIfNeeded(input) {
    const expires = input.credentials.expiresAt ? Date.parse(input.credentials.expiresAt) : Number.NaN;
    if (!Number.isFinite(expires)) throw new Error("The Threads connection needs reconnecting.");
    if (expires <= Date.now()) throw new Error("The Threads connection has expired and needs reconnecting.");
    if (expires > Date.now() + REFRESH_WINDOW_MS) return { kind: "unchanged" };
    const token = await refreshToken(input.credentials.accessToken, input.signal);
    return { kind: "refreshed", credentials: {
      accessToken: token.access_token,
      refreshToken: null,
      expiresAt: new Date(Date.now() + token.expires_in! * 1000).toISOString(),
      providerMetadata: input.credentials.providerMetadata,
    } };
  },

  async publish(input) {
    if (input.media && input.media.kind !== "image") return { kind: "not-published", message: "Threads supports text or one image in this pilot." };
    if (input.text.length > 500) return { kind: "not-published", message: "Threads text must be 500 characters or fewer." };
    const config = threadsConfig();
    if (!config) return { kind: "not-published", message: "Threads publishing is not configured." };
    try {
      const identity = await threadsRequest("me", input.credentials.accessToken, { fields: "id" });
      if (identity.id !== input.account.accountId) return { kind: "not-published", message: "The saved Threads token no longer matches the selected account." };
    } catch {
      return { kind: "not-published", message: "The Threads connection could not be verified. Reconnect before publishing." };
    }

    let containerId: string;
    try {
      const params: Record<string, string> = input.media
        ? { media_type: "IMAGE", image_url: input.media.url, text: input.text }
        : { media_type: "TEXT", text: input.text };
      const container = await threadsRequest("me/threads", input.credentials.accessToken, params, "POST");
      if (typeof container.id !== "string" || !container.id) return { kind: "not-published", message: "Threads did not prepare the post." };
      containerId = container.id;
    } catch (error) {
      return { kind: "not-published", message: error instanceof ThreadsApiError && error.status ? `Threads could not prepare the post (HTTP ${error.status}).` : "Threads could not prepare the post." };
    }

    // Wait briefly for a photo container to finish processing before publishing it.
    if (input.media) {
      let ready = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const status = await threadsRequest(containerId, input.credentials.accessToken, { fields: "status" });
          if (status.status === "FINISHED") { ready = true; break; }
          if (status.status === "ERROR" || status.status === "EXPIRED") return { kind: "not-published", message: "Threads could not prepare the approved image." };
        } catch {
          return { kind: "not-published", message: "Threads could not confirm that the image is ready." };
        }
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      if (!ready) return { kind: "not-published", message: "The Threads image is still processing. No post was published." };
    }

    let published: Record<string, unknown>;
    try {
      published = await threadsRequest("me/threads_publish", input.credentials.accessToken, { creation_id: containerId }, "POST", 20_000);
    } catch (error) {
      const status = error instanceof ThreadsApiError ? error.status : 0;
      return status > 0 && status < 500 && status !== 408 && status !== 429
        ? { kind: "not-published", message: `Threads rejected the post (HTTP ${status}).` }
        : { kind: "uncertain", message: "Threads may have accepted the post. Check the account before taking further action." };
    }
    if (typeof published.id !== "string" || !published.id) return { kind: "uncertain", message: "Threads did not confirm a post ID. Check the account before taking further action." };
    const externalId = published.id;
    try {
      const details = await threadsRequest(externalId, input.credentials.accessToken, { fields: "permalink" });
      return { kind: "published", externalId, ...(typeof details.permalink === "string" ? { externalUrl: details.permalink } : {}) };
    } catch {
      return { kind: "published", externalId };
    }
  },
};
